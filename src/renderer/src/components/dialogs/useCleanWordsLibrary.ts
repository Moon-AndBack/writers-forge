import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui'
import type { SegmentedOption, SelectOption } from '../ui'
import type {
  CleanWordCategory,
  CleanWordCount,
  CleanWordRow
} from '../../../../preload/types/cleanWords'
// 词库改动后令检测词表缓存失效。缓存与失效广播在共享层
// （`components/editor/cleanWordCache.ts`），页面层扫描插件订阅后重扫。
import { resetActiveCleanWords } from '../editor/cleanWordCache'
import { addCleanWord } from './cleanWordActions'
import {
  CATEGORIES,
  CATEGORY_LABEL_KEYS,
  MAX_WORD_CHARS,
  PAGE_SIZE,
  isCategory
} from './cleanWordsMeta'
import type { CategoryFilter, SourceFilter } from './cleanWordsMeta'

/* ---------- 数据读取 ---------- */

/** 全量词条 + 聚合计数（1274 条约 20KB，单次 IPC 可接受，换本地筛选零延迟）。纯函数，不碰 state。 */
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

/** 当前类别内置词的批量启停入口（`CleanWordsLibrary.categoryBulk`）。 */
export interface CategoryBulk {
  /** 该类别内置词条数（确认框展示）。 */
  count: number
  /** 是否有任意启用中的内置词（决定按钮是「禁用」还是「启用」）。 */
  anyEnabled: boolean
  /** 已翻译的类别名（确认框 / toast 插值）。 */
  label: string
  /** 执行批量启停：IPC → 缓存失效 → toast → 刷新列表与计数。 */
  apply: (enabled: boolean) => Promise<void>
}

export interface CleanWordsLibrary {
  /** toast 节点（挂到弹窗 return 内渲染）。 */
  toastNode: ReactNode
  /** 内置 / 自建词条总数。 */
  totals: { builtin: number; user: number }
  /**
   * 当前类别内置词的批量启停入口：类别筛选为「全部」或该类别无内置词时为 null。
   * 只操作 `source = 'builtin'`，用户自建词不受影响。
   */
  categoryBulk: CategoryBulk | null
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
  /** 单条添加：类别（默认 `other`）/ 内容 / 提交中。 */
  addCategory: CleanWordCategory
  addText: string
  adding: boolean
  /** 单条添加的类别选项（六类，不含「全部」）。 */
  addCategoryOptions: SelectOption[]
  handleSourceChange: (value: SourceFilter) => void
  handleCategoryChange: (value: string) => void
  handleQueryChange: (value: string) => void
  /** 重新取数（失败重试；新增 / 删除后亦复用）。 */
  refresh: () => Promise<void>
  loadMore: () => void
  handleRowToggle: (row: CleanWordRow) => (event: ChangeEvent<HTMLInputElement>) => void
  handleDelete: (row: CleanWordRow) => Promise<void>
  setAddCategory: (value: string) => void
  setAddText: (value: string) => void
  handleAdd: () => Promise<void>
}

/**
 * 违禁词库弹窗的取数、筛选、分页与词条增删动作。`open` 变化时重取一次全量。
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
  const [addCategory, setAddCategoryState] = useState<CleanWordCategory>('other')
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)

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

  /** 重新取数（新增 / 删除后刷新列表与计数）。 */
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

  /** 单条添加只写具体类别，故不含「全部」项。 */
  const addCategoryOptions = useMemo<SelectOption[]>(
    () =>
      CATEGORIES.map((category) => ({
        value: category,
        label: t(CATEGORY_LABEL_KEYS[category])
      })),
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

  /** 按类别批量启停内置词（IPC 失败返回 -1）；成功后失效检测缓存并刷新列表 / 计数。 */
  const applyCategoryBulk = useCallback(
    async (category: CleanWordCategory, enabled: boolean): Promise<void> => {
      const changed = await window.api.cleanWords.setCategoryEnabled(category, enabled)
      if (changed < 0) {
        showToast(t('cleanWords.categoryToggleFailed'))
        return
      }
      resetActiveCleanWords()
      showToast(
        t(enabled ? 'cleanWords.categoryEnableDone' : 'cleanWords.categoryDisableDone', {
          category: t(CATEGORY_LABEL_KEYS[category]),
          count: changed
        })
      )
      await refresh()
    },
    [refresh, showToast, t]
  )

  /** 仅当筛选到具体类别且该类别有内置词时提供批量入口。 */
  const categoryBulk = useMemo<CategoryBulk | null>(() => {
    if (categoryFilter === 'all') return null
    const builtinRows = rows.filter(
      (row) => row.category === categoryFilter && row.source === 'builtin'
    )
    if (builtinRows.length === 0) return null
    return {
      count: builtinRows.length,
      anyEnabled: builtinRows.some((row) => row.enabled),
      label: t(CATEGORY_LABEL_KEYS[categoryFilter]),
      apply: (enabled) => applyCategoryBulk(categoryFilter, enabled)
    }
  }, [applyCategoryBulk, categoryFilter, rows, t])

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

  /** 类别下拉：非法值回退 `other`（选项由本地枚举生成，正常不会触发）。 */
  const setAddCategory = useCallback((value: string): void => {
    setAddCategoryState(isCategory(value) ? value : 'other')
  }, [])

  /**
   * 单条添加：前置校验口径与右键菜单一致（trim 非空 / 无换行 / 2–100 字）。
   * `addCleanWord` 成功时内部已 `resetActiveCleanWords()`（正文即时重扫），失败未写库故不失效；
   * 成功（inserted / updated）后 `refresh()` 重取全量，列表与「内置 / 我的」计数一并更新。
   */
  const handleAdd = useCallback(async (): Promise<void> => {
    const word = addText.trim()
    if (word === '' || /[\r\n]/.test(addText) || word.length < 2 || word.length > MAX_WORD_CHARS) {
      return
    }
    setAdding(true)
    try {
      const outcome = await addCleanWord(word, addCategory)
      if (outcome === 'failed') {
        showToast(t('cleanWords.addFailed'))
        return
      }
      if (outcome === 'exists') {
        showToast(t('cleanWords.addExists', { word }))
        return
      }
      showToast(
        t(outcome === 'inserted' ? 'cleanWords.addDone' : 'cleanWords.addUpdated', { word })
      )
      setAddText('')
      await refresh()
    } finally {
      setAdding(false)
    }
  }, [addCategory, addText, refresh, showToast, t])

  const handleRowToggle =
    (row: CleanWordRow) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      void handleToggle(row, event.target.checked)
    }

  return {
    toastNode,
    totals,
    categoryBulk,
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
    addCategory,
    addText,
    adding,
    addCategoryOptions,
    handleSourceChange,
    handleCategoryChange,
    handleQueryChange,
    refresh,
    loadMore,
    handleRowToggle,
    handleDelete,
    setAddCategory,
    setAddText,
    handleAdd
  }
}
