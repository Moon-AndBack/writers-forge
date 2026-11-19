/**
 * 书籍页（书架视图）展示数据与纯函数。
 *
 * 说明：
 * - `Book` **以**主进程 `BookRow` 为基础（`src/main/database/books.ts`）：经 `import type`
 *   直接复用（`import type` 编译期擦除，不产生 `require`、不污染 renderer bundle；
 *   与 `chapterTree.ts` / `outlineTree.ts` 及 preload `types/database.d.ts` 同口径，
 *   §9 单一真源，消除「双份维护」漂移面），另加渲染层专用的统计可用性标记。
 *   `api.books.list()` 的返回值可直接赋给 `Book[]`。
 * - 过滤 / 排序均为无副作用纯函数，便于组件层保持受控与可测试。
 * - `FALLBACK_BOOKS`：仅在纯浏览器预览（无 `window.api.books`）时兜底的样例，
 *   与主进程种子数据（b1–b5）保持一致；接入数据库后正常路径不再使用，
 *   但保留可让无 Electron 环境下页面仍可渲染、不报错。
 * - 展示文案不在此硬编码：状态 / 筛选 / 排序等改为 `labelKey`（i18n `bookshelf` ns），
 *   由消费者 `useTranslation('bookshelf')` 后 `t(labelKey)`。字数格式化函数改为接收 `t`
 *   （调用点均在组件内，见 `formatBookWords` / `formatStatWords`）。
 */
import type { TFunction } from 'i18next'
import type { BookChannel, BookLength, BookRow, BookStatus } from '../../../../main/database/books'

/** 书籍领域类型（单一真源：主进程 BookRow 与其状态六态）。 */
export type { BookChannel, BookLength, BookRow, BookStatus }

/**
 * 书架展示用书籍：主进程 `BookRow` + 仅渲染层使用的统计可用性标记。
 *
 * `statsUnavailable` 为 true 表示这次实时统计没有该书的数据（首读尚未返回 / 读取失败），
 * 字数 / 章数 / 进度**未知**，卡片显示占位符；它与「统计成功且该书确实为 0」严格区分。
 */
export interface Book extends BookRow {
  statsUnavailable?: boolean
}

/** 实时统计不可用时的展示占位符（与「0 字」区分；标点无需翻译）。 */
export const STATS_PLACEHOLDER = '—'

/**
 * 状态展示文案键（i18n `bookshelf` ns）；消费者 `t(meta.labelKey)`。
 * 顺序沿用主进程 `BOOK_STATUSES`（writing/done/draft/paused/dropped/revising）。
 */
export type StatusLabelKey =
  | 'status.writing'
  | 'status.done'
  | 'status.draft'
  | 'status.paused'
  | 'status.dropped'
  | 'status.revising'

/** 状态元数据：展示文案键（不再硬编码中文）。 */
export interface StatusMeta {
  labelKey: StatusLabelKey
}

export const STATUS_META: Record<BookStatus, StatusMeta> = {
  writing: { labelKey: 'status.writing' },
  done: { labelKey: 'status.done' },
  draft: { labelKey: 'status.draft' },
  paused: { labelKey: 'status.paused' },
  dropped: { labelKey: 'status.dropped' },
  revising: { labelKey: 'status.revising' }
}

/**
 * 书架统计（骨架：书数由数据推导，数值来自实时统计）。
 *
 * 数值为 `null` 表示**统计从未成功取到**（首读未返回 / IPC 失败），与「成功且真实为 0」
 * 严格区分。三个字段同源（`stats:todayWords` / `stats:streakDays` / `stats:bookStatsAll`
 * 经同一个 `Promise.all` 获取）：要么一起为数值，要么一起为 `null`。成功过一次后若刷新
 * 失败，调用方保留上次的值，不回退 `null`。
 */
export interface ShelfStats {
  /** 累计字数（全书真实有效字数）；`null` = 统计未取到 */
  words: number | null
  /** 今日写作字数；`null` = 统计未取到 */
  today: number | null
  /** 连续写作天数；`null` = 统计未取到 */
  streak: number | null
}

/** 单本书真实统计（镜像主进程 BookStats，`api.stats.bookStatsAll` 的元素）。 */
export interface BookStats {
  chapters: number
  done: number
  words: number
  progress: number
}

/**
 * 用**实时统计**覆盖书籍列表的字数 / 章节数 / 进度（返回新数组，不修改入参）。
 *
 * **实时统计（`stats.bookStatsAll`）是唯一真源**：不再回退 `books` 表里的
 * `words` / `chapters` / `progress` 冗余列——这三列只在建书 / 编辑时写入，正文保存与
 * 章节增删都不会更新，值可能长期陈旧。
 *
 * 统计映射缺该书时视为**未知**并置 `statsUnavailable`（卡片显示 `—`），而不是 0：
 * `bookStatsAll` 以 `books LEFT JOIN chapters` 返回完整映射，无章的书也有 0 值条目，
 * 所以缺项只可能来自统计未取到（首读未返回 / IPC 失败）。若此前已成功取到统计，
 * 调用方会保留旧映射，继续显示上次的值。
 */
export function mergeBookStats(books: readonly Book[], stats: Record<string, BookStats>): Book[] {
  return books.map((book) => {
    const stat = stats[book.id]
    if (!stat) {
      // 数值归零仅是防御性兜底；消费者必须以 `statsUnavailable` 判定并显示占位。
      return { ...book, words: 0, chapters: 0, progress: 0, statsUnavailable: true }
    }
    return {
      ...book,
      words: stat.words,
      chapters: stat.chapters,
      progress: stat.progress,
      statsUnavailable: false
    }
  })
}

/**
 * 纯浏览器预览兜底样例（与主进程种子 b1–b5 对应）。
 *
 * `categories` 一律置空：分类已改为 **ID 体系**（指向 `categories.id`），纯浏览器环境
 * 无分类表可查，中文名字面量既非法也无法展示（卡片分类区为条件渲染，空数组即隐藏）。
 */
export const FALLBACK_BOOKS: readonly Book[] = [
  {
    id: 'b1',
    title: '雾起南屿',
    intro: '',
    categories: [],
    status: 'writing',
    channel: null,
    lengthType: null,
    words: 42000,
    chapters: 12,
    progress: 42,
    coverChar: '雾',
    coverColor: 'purple',
    createdAt: '2026-09-20 09:00:00.000',
    updatedAt: '2026-10-05 18:20:00.000'
  },
  {
    id: 'b2',
    title: '长夜将尽',
    intro: '',
    categories: [],
    status: 'writing',
    channel: null,
    lengthType: null,
    words: 29000,
    chapters: 8,
    progress: 28,
    coverChar: '长',
    coverColor: 'blue',
    createdAt: '2026-09-18 14:00:00.000',
    updatedAt: '2026-10-04 11:05:00.000'
  },
  {
    id: 'b3',
    title: '星海回声',
    intro: '',
    categories: [],
    status: 'done',
    channel: null,
    lengthType: null,
    words: 386000,
    chapters: 42,
    progress: 100,
    coverChar: '星',
    coverColor: 'green',
    createdAt: '2026-06-01 08:00:00.000',
    updatedAt: '2026-09-30 20:40:00.000'
  },
  {
    id: 'b4',
    title: '夏日终曲',
    intro: '',
    categories: [],
    status: 'draft',
    channel: null,
    lengthType: null,
    words: 8420,
    chapters: 3,
    progress: 8,
    coverChar: '夏',
    coverColor: 'orange',
    createdAt: '2026-09-10 10:00:00.000',
    updatedAt: '2026-09-28 16:10:00.000'
  },
  {
    id: 'b5',
    title: '灰塔手记',
    intro: '',
    categories: [],
    status: 'writing',
    channel: null,
    lengthType: null,
    words: 12000,
    chapters: 5,
    progress: 15,
    coverChar: '灰',
    coverColor: 'violet',
    createdAt: '2026-09-05 09:00:00.000',
    updatedAt: '2026-09-26 09:30:00.000'
  }
]

/** 筛选值：全部或某一状态。 */
export type ShelfFilter = 'all' | BookStatus

/** 筛选选项展示文案键（i18n `bookshelf` ns）：`filter.all` / `filter.<status>`。 */
export type ShelfFilterLabelKey = `filter.${ShelfFilter}`

export interface ShelfFilterOption {
  value: ShelfFilter
  labelKey: ShelfFilterLabelKey
}

/**
 * 工具条筛选标签页（沿用主进程 BOOK_STATUSES 顺序：全部 / 连载中 / 已完结 / 草稿 /
 * 暂停 / 太监 / 修订中）。
 */
export const SHELF_FILTERS: readonly ShelfFilterOption[] = [
  { value: 'all', labelKey: 'filter.all' },
  { value: 'writing', labelKey: 'filter.writing' },
  { value: 'done', labelKey: 'filter.done' },
  { value: 'draft', labelKey: 'filter.draft' },
  { value: 'paused', labelKey: 'filter.paused' },
  { value: 'dropped', labelKey: 'filter.dropped' },
  { value: 'revising', labelKey: 'filter.revising' }
]

/** 排序值。 */
export type ShelfSort = 'recent' | 'words' | 'chapters' | 'title'

export interface ShelfSortOption {
  value: ShelfSort
  labelKey: `sort.${ShelfSort}`
}

/** 排序选项（默认「最近编辑」，按 updatedAt 倒序）。 */
export const SHELF_SORTS: readonly ShelfSortOption[] = [
  { value: 'recent', labelKey: 'sort.recent' },
  { value: 'words', labelKey: 'sort.words' },
  { value: 'chapters', labelKey: 'sort.chapters' },
  { value: 'title', labelKey: 'sort.title' }
]

/** 按状态与关键词过滤（关键词仅匹配书名，大小写不敏感）。作者已非书籍字段，不参与搜索。 */
export function filterBooks(books: readonly Book[], filter: ShelfFilter, query: string): Book[] {
  const keyword = query.trim().toLowerCase()
  return books.filter((book) => {
    if (filter !== 'all' && book.status !== filter) return false
    if (keyword === '') return true
    return book.title.toLowerCase().includes(keyword)
  })
}

/**
 * 统计维度排序：未知统计（实时数据未取到）一律排在末尾，避免把占位当成 0 参与排序。
 * 两边都未知时视为相等，保持原有相对顺序。
 */
function compareByStat(a: Book, b: Book, pick: (book: Book) => number): number {
  const aUnknown = a.statsUnavailable === true
  const bUnknown = b.statsUnavailable === true
  if (aUnknown !== bUnknown) return aUnknown ? 1 : -1
  if (aUnknown) return 0
  return pick(b) - pick(a)
}

/** 按指定方式排序（返回新数组，不修改入参）。 */
export function sortBooks(books: readonly Book[], sort: ShelfSort): Book[] {
  const result = [...books]
  switch (sort) {
    case 'words':
      return result.sort((a, b) => compareByStat(a, b, (book) => book.words))
    case 'chapters':
      return result.sort((a, b) => compareByStat(a, b, (book) => book.chapters))
    case 'title':
      return result.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    case 'recent':
    default:
      // updatedAt 为 'YYYY-MM-DD HH:MM:SS.mmm'，字典序即时间序
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
}

/**
 * 书籍卡片字数展示：≥1 万显示「x.x 万字」，否则显示千分位「n 字」。
 *
 * `t` 由调用组件经 `useTranslation('bookshelf')` 注入（本函数为纯函数，不依赖 hook 上下文）。
 * 注：`toLocaleString('en-US')` 为既存硬编码，本批不改（列为已知项）。
 */
export function formatBookWords(t: TFunction<'bookshelf'>, words: number): string {
  if (words >= 10000) return t('wordCount.wanBook', { value: trimZero(words / 10000) })
  return t('wordCount.chars', { value: words.toLocaleString('en-US') })
}

/** 统计累计字数展示：始终以「万」为单位（如 12.4 万）。`t` 由调用组件注入。 */
export function formatStatWords(t: TFunction<'bookshelf'>, words: number): string {
  return t('wordCount.wan', { value: trimZero(words / 10000) })
}

/** 千分位整数（如 2,847）。 */
export function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

/** 去掉小数末尾多余的 0（4.0 → 4，4.2 → 4.2）。 */
function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}
