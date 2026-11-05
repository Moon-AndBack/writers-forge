/**
 * 灵感筛选条件的 Provider（挂在外壳层，`App.tsx` 中与 `DossierFilterProvider` 并列）。
 *
 * `bookId` 真源：从 `useLocation().pathname` 解析 `/write/:bookId`（活动栏是 `Routes`
 * 的兄弟节点，`useParams()` 在此为空；解析口径与 `DossierFilterProvider` 一致）。
 *
 * 标签集合也在此维护：一次按书拉取 `inspiration.tags`，供活动栏浮层展示
 * 「预置 ∪ 已用标签」；装配 hook 在写操作后调用 `refreshTags` 同步最新结果。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { createLogger } from '@renderer/lib/log'
import {
  EMPTY_INSPIRATION_FILTER,
  EMPTY_INSPIRATION_TAGS,
  InspirationFilterContext,
  type InspirationFilterContextValue,
  type InspirationFilterEntry
} from './inspirationFilterContext'

/** 灵感筛选日志（转发至主进程落盘）。 */
const log = createLogger('inspiration')

/** 写作页路由判据：`/write/:bookId`（不吞后续路径段）。 */
const WRITE_PATH_PATTERN = /^\/write\/([^/?#]+)/

/** 从 pathname 解析当前书 id（非写作页返回空串）。 */
function parseBookIdFromPath(pathname: string): string {
  return WRITE_PATH_PATTERN.exec(pathname)?.[1] ?? ''
}

/** 条件与标签：连同所属书一起打标，换书后旧数据自然失效（无需在 effect 里重置）。 */
interface FilterStore {
  bookId: string
  filters: InspirationFilterEntry
  tags: string[]
}

export function InspirationFilterProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const bookId = parseBookIdFromPath(pathname)
  const [store, setStore] = useState<FilterStore>({
    bookId: '',
    filters: EMPTY_INSPIRATION_FILTER,
    tags: EMPTY_INSPIRATION_TAGS
  })

  // 换书 / 进入书架后旧条件与旧标签不再命中。
  const sameBook = store.bookId === bookId
  const filters = sameBook ? store.filters : EMPTY_INSPIRATION_FILTER
  const tags = sameBook ? store.tags : EMPTY_INSPIRATION_TAGS

  // 合并式更新：只替换条件对象，标签保持原引用（下游 useMemo 不失效）。
  const setFilter = useCallback(
    (patch: Partial<InspirationFilterEntry>): void => {
      setStore((prev) => {
        const same = prev.bookId === bookId
        return {
          bookId,
          filters: { ...(same ? prev.filters : EMPTY_INSPIRATION_FILTER), ...patch },
          tags: same ? prev.tags : EMPTY_INSPIRATION_TAGS
        }
      })
    },
    [bookId]
  )

  const clearAll = useCallback((): void => {
    setStore((prev) => {
      const same = prev.bookId === bookId
      if (same && prev.filters.tag === null && prev.filters.query === '') return prev
      return {
        bookId,
        filters: EMPTY_INSPIRATION_FILTER,
        tags: same ? prev.tags : EMPTY_INSPIRATION_TAGS
      }
    })
  }, [bookId])

  /** 拉取当前书标签集合；无 API（测试 / 非 Electron）时返回 null。 */
  const fetchTags = useCallback(async (): Promise<string[] | null> => {
    if (bookId === '') return null
    const api = window.api?.inspiration
    if (!api) return null
    try {
      return await api.tags(bookId)
    } catch (error) {
      log.warn('灵感标签加载失败', error)
      return null
    }
  }, [bookId])

  /** 写操作后刷新标签（装配 hook 调用）；换书途中返回的旧结果直接丢弃。 */
  const refreshTags = useCallback(async (): Promise<void> => {
    const next = await fetchTags()
    if (next === null) return
    setStore((prev) => (prev.bookId === bookId ? { ...prev, tags: next } : prev))
  }, [bookId, fetchTags])

  // 按书拉取一次标签：响应落地时顺带把 store 的书 id 切到当前书（保留同书条件）。
  useEffect(() => {
    if (bookId === '') return undefined
    let cancelled = false
    void fetchTags().then((next) => {
      if (cancelled || next === null) return
      setStore((prev) => ({
        bookId,
        filters: prev.bookId === bookId ? prev.filters : EMPTY_INSPIRATION_FILTER,
        tags: next
      }))
    })
    return () => {
      cancelled = true
    }
  }, [bookId, fetchTags])

  const value = useMemo<InspirationFilterContextValue>(
    () => ({ bookId, filters, setFilter, clearAll, tags, refreshTags }),
    [bookId, filters, setFilter, clearAll, tags, refreshTags]
  )

  return (
    <InspirationFilterContext.Provider value={value}>{children}</InspirationFilterContext.Provider>
  )
}
