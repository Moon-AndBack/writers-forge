import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { FALLBACK_BOOKS, type Book, type BookStats, type ShelfStats } from './data'

/** 书架数据层返回值：列表、首读 / 错误态、实时统计与分类映射。 */
export interface BookshelfData {
  /** 数据库书籍行（纯浏览器预览为兜底样例） */
  bookList: Book[]
  /** 纯浏览器兜底时新建 / 编辑 / 删除直接改本地列表 */
  setBookList: Dispatch<SetStateAction<Book[]>>
  /** 首读态：先于错误 / 空态判定 */
  loading: boolean
  /** 书架读取失败标记 */
  loadError: boolean
  /** 各书实时统计（`stats.bookStatsAll`） */
  statsByBook: Record<string, BookStats>
  /** 书架汇总统计（累计字数 / 今日写作 / 连续天数）；字段为 `null` = 从未取到，非 0 */
  shelfStats: ShelfStats
  /** 分类 ID → 名称映射（卡片标签展示用） */
  categoryNames: Map<number, string>
  /** 重新从数据库拉取列表与统计（无 API 时为空操作） */
  refresh: () => Promise<void>
}

/**
 * 书架数据加载：书籍列表、首读 / 错误态、实时统计与分类映射。
 * 无 Electron API 时回退静态样例，保证纯浏览器预览不报错。
 */
export function useBookshelfData(): BookshelfData {
  const booksApi = window.api?.books
  const [bookList, setBookList] = useState<Book[]>(() =>
    window.api?.books ? [] : [...FALLBACK_BOOKS]
  )
  // 首读态：先于错误 / 空态判定，避免数据回来前先闪「还没有书籍」。
  const [loading, setLoading] = useState(() => window.api?.books !== undefined)
  // 书架读取失败标记：区分「书架真的是空的」与「读取失败」（后者给出重试）。
  const [loadError, setLoadError] = useState(false)
  const [statsByBook, setStatsByBook] = useState<Record<string, BookStats>>({})
  // 初始 `null`：统计尚未返回，状态栏据此显示占位而非 0（避免与空库混淆）。
  const [shelfStats, setShelfStats] = useState<ShelfStats>({
    words: null,
    today: null,
    streak: null
  })
  // 分类 ID → 名称映射（来自 categories:list），供书籍卡片渲染分类标签。
  const [categoryNames, setCategoryNames] = useState<Map<number, string>>(new Map())

  /** 拉取实时统计（累计字数 / 今日写作 / 连续天数 + 各书统计；无 API 时空操作）。 */
  const loadStats = useCallback(async (): Promise<void> => {
    const statsApi = window.api?.stats
    if (!statsApi) return
    try {
      const [today, streak, byBook] = await Promise.all([
        statsApi.todayWords(),
        statsApi.streakDays(),
        statsApi.bookStatsAll()
      ])
      // 累计字数由同一次批量统计汇总，避免 `totalWords` 再触发一次全库扫描（口径不变）。
      let total = 0
      for (const stats of Object.values(byBook)) total += stats.words
      setShelfStats({ words: total, today, streak })
      setStatsByBook(byBook)
    } catch {
      /* 统计读取失败静默忽略：保留现有值。首次失败维持 `null`（状态栏显示占位），
         成功过则继续显示上次的值，不回退为 0 / 占位。 */
    }
  }, [])

  /** 重新从数据库拉取列表（无 API 时为空操作）。 */
  const refresh = useCallback(async (): Promise<void> => {
    if (!booksApi) return
    try {
      setBookList(await booksApi.list())
      setLoadError(false)
    } catch {
      /* IPC 失败：标记错误态（列表为空时显示「加载失败 + 重试」），保留现有列表 */
      setLoadError(true)
    }
    await loadStats()
  }, [booksApi, loadStats])

  // 挂载时载入数据库行与实时统计；纯浏览器保留兜底样例。
  useEffect(() => {
    if (!booksApi) return undefined
    let active = true
    booksApi
      .list()
      .then((rows) => {
        if (!active) return
        setBookList(rows)
        setLoadError(false)
        setLoading(false)
      })
      .catch(() => {
        /* 读取失败：标记错误态，避免把「读取失败」显示成「书架为空」 */
        if (active) {
          setLoadError(true)
          setLoading(false)
        }
      })
    // 微任务中拉取统计，避免在 effect 内同步触发 setState（react-hooks/set-state-in-effect）。
    void Promise.resolve().then(loadStats)
    return () => {
      active = false
    }
  }, [booksApi, loadStats])

  // 分类 ID → 名称映射（卡片标签展示用；失败静默，标签区整体不渲染）。
  useEffect(() => {
    const categoriesApi = window.api?.categories
    if (!categoriesApi) return undefined
    let active = true
    categoriesApi
      .list()
      .then((rows) => {
        if (active) setCategoryNames(new Map(rows.map((row) => [row.id, row.name])))
      })
      .catch(() => {
        /* 读取失败静默忽略 */
      })
    return () => {
      active = false
    }
  }, [])

  return {
    bookList,
    setBookList,
    loading,
    loadError,
    statsByBook,
    shelfStats,
    categoryNames,
    refresh
  }
}
