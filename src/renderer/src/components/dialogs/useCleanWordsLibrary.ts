import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui'
import type { SegmentedOption, SelectOption } from '../ui'
import type { CleanWordCount, CleanWordRow } from '../../../../preload/types/cleanWords'
// 词库改动后令检测词表缓存失效。缓存与失效广播在共享层
// （`components/editor/cleanWordCache.ts`），页面层扫描插件订阅后重扫。
import { resetActiveCleanWords } from '../editor/cleanWordCache'
import { addCleanWords } from './cleanWordActions'
import { CATEGORIES, CATEGORY_LABEL_KEYS, PAGE_SIZE, isCategory } from './cleanWordsMeta'
import type { CategoryFilter, SourceFilter } from './cleanWordsMeta'
import { parseImportText } from './cleanWordsImport'

/* ---------- 数据读取 ---------- */

/** 全量词条 + 聚合计数（853 条单次 IPC 可接受，换本地筛选零延迟）。纯函数，不碰 state。 */
async function fetchCleanWords(): Promise<{
  rows: CleanWordRow[]
  counts: CleanWordCount[]
} | null> {
  try {
    const [rows, counts] = await Promise.all([
      window.api.cleanWords.list(),
      window.api.cleanWords.count()
    ])
    return { rows, counts }
  } catch {
    return null
  }
}

export interface CleanWordsLibrary {
  /** toast 节点（挂到弹窗 return 内渲染）。 */
  toastNode: ReactNode
  /** 内置 / 自建词条总数。 */
  totals: { builtin: number; user: number }
  loaded: boolean
  failed: boolean
  sourceFilter: SourceFilter
  categoryFilter: CategoryFilter
  query: string
  /** 是否有任一筛选生效（区分「真的没有词条」与「筛选无结果」）。 */
  hasActiveFilter: boolean
  sourceOptions: ReadonlyArray<SegmentedOption<SourceFilter>>
  categoryOptions: SelectOption[]
  filtered: CleanWordRow[]
  visibleRows: CleanWordRow[]
  importOpen: boolean
  importText: string
  importing: boolean
  handleSourceChange: (value: SourceFilter) => void
  handleCategoryChange: (value: string) => void
  handleQueryChange: (value: string) => void
  /** 重新取数（失败重试；导入 / 删除后亦复用）。 */
  refresh: () => Promise<void>
  loadMore: () => void
  handleRowToggle: (row: CleanWordRow) => (event: ChangeEvent<HTMLInputElement>) => void
  handleDelete: (row: CleanWordRow) => Promise<void>
  toggleImport: () => void
  setImportText: (value: string) => void
  handleImport: () => Promise<void>
}

/**
 * 违禁词库弹窗的取数、筛选、分页与词条增删 / 导入动作。`open` 变化时重取一次全量。
 * `t` 为 `chapters` ns（与弹窗 / 词表同 ns，key 路径沿用原实现）。
 */
export function useCleanWordsLibrary(open: boolean): CleanWordsLibrary {
  const { t } = useTranslation('chapters')
  const { show: showToast, node: toastNode } = useToast()

  const [rows, setRows] = useState<CleanWordRow[]>([])
  const [counts, setCounts] = useState<CleanWordCount[]>([])
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  /** 落库取数结果（effect 与事件处理器共用，避免两处重复 setState）。 */
  const applyData = useCallback((result: Awaited<ReturnType<typeof fetchCleanWords>>): void => {
    if (result) {
      setRows(result.rows)
      setCounts(result.counts)
      setFailed(false)
    } else {
      setFailed(true)
    }
    setLoaded(true)
  }, [])

  /** 重新取数（导入 / 删除后刷新列表与计数）。 */
  const refresh = useCallback(async (): Promise<void> => {
    applyData(await fetchCleanWords())
  }, [applyData])

  // 每次打开重取一次（词库可能被别处改动）。setState 均在异步回调内；`cancelled`
  // 处理「取数途中关闭弹窗」。
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    void fetchCleanWords().then((result) => {
      if (!cancelled) applyData(result)
    })
    return () => {
      cancelled = true
    }
  }, [open, applyData])

  const totals = useMemo(() => {
    let builtin = 0
    let user = 0
    for (const item of counts) {
      if (item.source === 'builtin') builtin += item.count
      else user += item.count
    }
    return { builtin, user }
  }, [counts])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (sourceFilter !== 'all' && row.source !== sourceFilter) return false
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (keyword !== '' && !row.word.toLowerCase().includes(keyword)) return false
      return true
    })
  }, [rows, sourceFilter, categoryFilter, query])

  const visibleRows = useMemo(() => filtered.slice(0, visible), [filtered, visible])

  /** 空态分流用：三项筛选任一非默认即视为「筛选后无结果」。 */
  const hasActiveFilter = sourceFilter !== 'all' || categoryFilter !== 'all' || query.trim() !== ''

  const sourceOptions = useMemo<ReadonlyArray<SegmentedOption<SourceFilter>>>(
    () => [
      { value: 'all' as const, label: t('cleanWords.sourceAll') },
      { value: 'builtin' as const, label: t('cleanWords.sourceBuiltin') },
      { value: 'user' as const, label: t('cleanWords.sourceUser') }
    ],
    [t]
  )

  const categoryOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: t('cleanWords.categoryAll') },
      ...CATEGORIES.map((category) => ({
        value: category,
        label: t(CATEGORY_LABEL_KEYS[category])
      }))
    ],
    [t]
  )

  /** 筛选变化后回到首屏，避免「筛出 3 条却停在第二页」。 */
  const resetPaging = useCallback((): void => setVisible(PAGE_SIZE), [])

  const handleSourceChange = useCallback(
    (value: SourceFilter): void => {
      setSourceFilter(value)
      resetPaging()
    },
    [resetPaging]
  )

  const handleCategoryChange = useCallback(
    (value: string): void => {
      setCategoryFilter(value === 'all' || isCategory(value) ? value : 'all')
      resetPaging()
    },
    [resetPaging]
  )

  const handleQueryChange = useCallback(
    (value: string): void => {
      setQuery(value)
      resetPaging()
    },
    [resetPaging]
  )

  const loadMore = useCallback((): void => setVisible((prev) => prev + PAGE_SIZE), [])

  const handleToggle = useCallback(
    async (row: CleanWordRow, enabled: boolean): Promise<void> => {
      const ok = await window.api.cleanWords.toggle(row.id, enabled)
      if (!ok) {
        showToast(t('cleanWords.toggleFailed'))
        return
      }
      // 就地更新：不整表重取，开关无闪烁。
      setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, enabled } : item)))
      resetActiveCleanWords()
    },
    [showToast, t]
  )

  const handleDelete = useCallback(
    async (row: CleanWordRow): Promise<void> => {
      const ok = await window.api.cleanWords.delete(row.id)
      if (!ok) {
        showToast(t('cleanWords.deleteFailed'))
        return
      }
      setRows((prev) => prev.filter((item) => item.id !== row.id))
      resetActiveCleanWords()
      showToast(t('cleanWords.deleteDone', { word: row.word }))
      void refresh()
    },
    [refresh, showToast, t]
  )

  const handleImport = useCallback(async (): Promise<void> => {
    const { words, invalid } = parseImportText(importText)
    if (words.length === 0) {
      showToast(t('cleanWords.importEmpty'))
      return
    }
    setImporting(true)
    try {
      // 入库动作与右键菜单共用（`addCleanWords` 内含 `resetActiveCleanWords()`）。
      const result = await addCleanWords(words)
      if (!result) {
        showToast(t('cleanWords.importFailed'))
        return
      }
      const skipped = result.skipped + invalid
      showToast(
        t('cleanWords.importDone', {
          inserted: result.inserted,
          updated: result.updated,
          skipped
        })
      )
      setImportText('')
      setImportOpen(false)
      await refresh()
    } finally {
      setImporting(false)
    }
  }, [importText, refresh, showToast, t])

  const handleRowToggle =
    (row: CleanWordRow) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      void handleToggle(row, event.target.checked)
    }

  const toggleImport = useCallback((): void => setImportOpen((prev) => !prev), [])

  return {
    toastNode,
    totals,
    loaded,
    failed,
    sourceFilter,
    categoryFilter,
    query,
    hasActiveFilter,
    sourceOptions,
    categoryOptions,
    filtered,
    visibleRows,
    importOpen,
    importText,
    importing,
    handleSourceChange,
    handleCategoryChange,
    handleQueryChange,
    refresh,
    loadMore,
    handleRowToggle,
    handleDelete,
    toggleImport,
    setImportText,
    handleImport
  }
}
