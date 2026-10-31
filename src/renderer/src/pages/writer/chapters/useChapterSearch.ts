import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/lib/log'

/** 搜索链路日志（转发至主进程落盘）。 */
const log = createLogger('useChapterSearch')

/** 搜索范围：本章 / 全书。 */
export type ChapterSearchScope = 'chapter' | 'book'

/**
 * 单条命中：**直接派生自 preload `Api`**（`chapters:search` 出参条目类型），
 * 消除渲染层平行定义——主进程 `ChapterSearchHit` 字段变更（如 `documentId` → `chapterId`）
 * 自动同步，不再需要人工镜像。
 */
export type ChapterSearchHit = Awaited<
  ReturnType<Window['api']['chapters']['search']>
>['items'][number]

/** 输入防抖毫秒数（避免逐字全表扫描）。 */
const INPUT_DEBOUNCE_MS = 300
/** 每页命中数。 */
const PAGE_SIZE = 50

export interface UseChapterSearchOptions {
  /** 书籍 id。 */
  bookId: string
  /** 当前选中章 id；本章范围与「跳转 / 定位」以此为准。 */
  chapterId: number | null
  /** 跳转其它章：切换 `selectedChapterId`。 */
  onSelectChapter: (chapterId: number) => void
  /** 在当前编辑器内定位 / 选中命中（ChaptersView 提供，含按段落 idx 估算与重试）。 */
  onLocate: (hit: ChapterSearchHit) => void
  /** 替换前：先 flush 编辑器中未落盘的挂起保存，避免防抖保存覆盖替换结果。 */
  beforeReplace: () => Promise<void>
  /** 替换后：若当前章被改，重载该章内容。 */
  afterReplace: (chapterIds: number[]) => Promise<void>
}

export interface ChapterSearchController {
  query: string
  replacement: string
  scope: ChapterSearchScope
  items: ChapterSearchHit[]
  total: number
  hasMore: boolean
  truncated: boolean
  loading: boolean
  busy: boolean
  error: string | null
  /** 当前跳转选中的命中（列表高亮）。 */
  active: ChapterSearchHit | null
  setQuery: (value: string) => void
  setReplacement: (value: string) => void
  setScope: (scope: ChapterSearchScope) => void
  /** 加载下一页。 */
  loadMore: () => void
  /** 立即重新搜索（保持已加载条数）。 */
  refresh: () => void
  /** 点击结果行：跳到该章并定位。 */
  requestJump: (hit: ChapterSearchHit) => void
  /** 替换单条命中。 */
  replaceOne: (hit: ChapterSearchHit) => void
  /** 替换全部（按当前范围）。 */
  replaceAll: () => void
}

/**
 * 章节搜索 / 替换的渲染层状态机。
 *
 * - **触发**：`query` / `scope` / （本章范围下）`chapterId` 变化 → 防抖 300ms 后请求首页；
 * - **可中断**：每次请求带自增 `seq`，过期响应（用户已改查询 / 切范围）直接丢弃，不写入状态；
 * - **分页**：首页 `PAGE_SIZE` 条，`loadMore` 追加下一页；`total` / `hasMore` 驱动「加载更多」；
 * - **替换**：先 `beforeReplace()`（flush 挂起保存）→ IPC → `afterReplace()`（重载当前章）→ 重搜刷新列表；
 * - **跳转**：切换选中章（跨章）并触发 `onLocate`（含按段落 idx 估算定位 / 选中）。
 */
export function useChapterSearch(options: UseChapterSearchOptions): ChapterSearchController {
  const { bookId, chapterId, onSelectChapter, onLocate, beforeReplace, afterReplace } = options
  const { t } = useTranslation('chapters')

  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [scope, setScope] = useState<ChapterSearchScope>('chapter')
  const [items, setItems] = useState<ChapterSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState<ChapterSearchHit | null>(null)
  // 跳转序号：同一命中行重复点击也能触发重新定位（active 引用相同时 React 会跳过更新）。
  const [jumpNonce, setJumpNonce] = useState(0)

  // 过期响应丢弃：仅最新 seq 的响应可写状态。
  const seqRef = useRef(0)
  // 回调经 ref 保鲜，避免 effect / callback 依赖变化。
  const locateRef = useRef(onLocate)
  const selectRef = useRef(onSelectChapter)
  const beforeRef = useRef(beforeReplace)
  const afterRef = useRef(afterReplace)
  useEffect(() => {
    locateRef.current = onLocate
    selectRef.current = onSelectChapter
    beforeRef.current = beforeReplace
    afterRef.current = afterReplace
  }, [onLocate, onSelectChapter, beforeReplace, afterReplace])

  const scopeChapterId = scope === 'chapter' ? chapterId : null

  /** 执行一次搜索（append = 追加下一页）；返回本次取到的命中（供替换后定位）。 */
  const runSearch = useCallback(
    async (offset: number, append: boolean): Promise<ChapterSearchHit[]> => {
      const api = window.api?.chapters
      const trimmed = query.trim()
      if (!api || bookId === '' || trimmed === '') {
        seqRef.current += 1
        setItems([])
        setTotal(0)
        setHasMore(false)
        setTruncated(false)
        setLoading(false)
        setActive(null)
        return []
      }
      const seq = ++seqRef.current
      setLoading(true)
      setError(null)
      try {
        const page = await api.search(bookId, {
          query: trimmed,
          scope,
          currentChapterId: scopeChapterId,
          offset,
          limit: PAGE_SIZE
        })
        if (seq !== seqRef.current) return []
        setItems((prev) => (append ? [...prev, ...page.items] : page.items))
        setTotal(page.total)
        setHasMore(page.hasMore)
        setTruncated(page.truncated)
        return page.items
      } catch (err) {
        if (seq !== seqRef.current) return []
        log.warn('搜索失败', err)
        setError(t('search.errorSearch'))
        if (!append) setItems([])
        return []
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [bookId, query, scope, scopeChapterId, t]
  )

  // 查询 / 范围 /（本章）章节变化 → 防抖后请求首页；空查询立即清空。
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '' || bookId === '') {
      seqRef.current += 1
      // 延迟到微任务再清空，避免在 effect 体内同步 setState（react-hooks/set-state-in-effect）。
      void Promise.resolve().then(() => {
        setItems([])
        setTotal(0)
        setHasMore(false)
        setTruncated(false)
        setLoading(false)
        setActive(null)
      })
      return undefined
    }
    const timer = window.setTimeout(() => {
      void runSearch(0, false)
    }, INPUT_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [bookId, query, scopeChapterId, runSearch])

  const loadMore = useCallback((): void => {
    if (loading || !hasMore) return
    void runSearch(items.length, true)
  }, [loading, hasMore, items.length, runSearch])

  /** 重新搜索并保持已加载条数（替换后刷新）。 */
  const refresh = useCallback((): void => {
    void runSearch(0, false)
  }, [runSearch])
  const requestJump = useCallback(
    (hit: ChapterSearchHit): void => {
      setActive(hit)
      setJumpNonce((n) => n + 1)
      if (hit.chapterId !== chapterId) selectRef.current(hit.chapterId)
    },
    [chapterId]
  )

  const replaceOne = useCallback(
    async (hit: ChapterSearchHit): Promise<void> => {
      const api = window.api?.chapters
      const trimmed = query.trim()
      if (!api || trimmed === '' || busy) return
      setBusy(true)
      try {
        await beforeRef.current()
        const result = await api.replace(bookId, {
          query: trimmed,
          replacement,
          chapterId: hit.chapterId,
          paragraphIdx: hit.paragraphIdx,
          start: hit.start,
          end: hit.end
        })
        if (result.replaced > 0) {
          await afterRef.current([hit.chapterId])
          const fresh = await runSearch(0, false)
          // 重新定位：命中之后条目前移，取同章最近一条；无则同章任意一条；再退到第一条。
          const next =
            fresh.find(
              (item) => item.chapterId === hit.chapterId && item.paragraphIdx >= hit.paragraphIdx
            ) ??
            fresh.find((item) => item.chapterId === hit.chapterId) ??
            fresh[0] ??
            null
          setActive(next)
          if (next && next.chapterId !== chapterId) selectRef.current(next.chapterId)
        } else {
          setError(t('search.staleHit'))
        }
      } catch (err) {
        log.warn('单条替换失败', err)
        setError(t('search.errorReplace'))
      } finally {
        setBusy(false)
      }
    },
    [bookId, query, replacement, busy, chapterId, runSearch, t]
  )

  const replaceAll = useCallback(async (): Promise<void> => {
    const api = window.api?.chapters
    const trimmed = query.trim()
    if (!api || trimmed === '' || busy) return
    setBusy(true)
    try {
      await beforeRef.current()
      const result = await api.replaceAll(bookId, {
        query: trimmed,
        replacement,
        scope,
        currentChapterId: scopeChapterId
      })
      if (result.chapters > 0) await afterRef.current(result.chapterIds)
      await runSearch(0, false)
      setActive(null)
    } catch (err) {
      log.warn('替换全部失败', err)
      setError(t('search.errorReplaceAll'))
    } finally {
      setBusy(false)
    }
  }, [bookId, query, replacement, busy, scope, scopeChapterId, runSearch, t])

  /** 当前章被选中（或重复点击同一命中）后定位：依赖 jumpNonce 保证重复点击也触发。 */
  useEffect(() => {
    if (!active) return
    if (active.chapterId !== chapterId) return
    locateRef.current(active)
  }, [active, chapterId, jumpNonce])

  return {
    query,
    replacement,
    scope,
    items,
    total,
    hasMore,
    truncated,
    loading,
    busy,
    error,
    active,
    setQuery,
    setReplacement,
    setScope,
    loadMore,
    refresh,
    requestJump,
    replaceOne: (hit) => {
      void replaceOne(hit)
    },
    replaceAll: () => {
      void replaceAll()
    }
  }
}
