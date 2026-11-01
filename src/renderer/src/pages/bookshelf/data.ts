/**
 * 书籍页（书架视图）展示数据与纯函数。
 *
 * 说明：
 * - `Book` **即**主进程 `BookRow`（`src/main/database/books.ts`）：经 `import type`
 *   直接复用（`import type` 编译期擦除，不产生 `require`、不污染 renderer bundle；
 *   与 `chapterTree.ts` / `outlineTree.ts` 及 preload `types/database.d.ts` 同口径，
 *   §9 单一真源，消除「双份维护」漂移面）。`api.books.list()` 的返回值可直接赋给 `Book[]`。
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

/** 渲染层领域别名：与主进程 `BookRow` 全同构（保留既有 `Book` 引用点零改动）。 */
export type Book = BookRow

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

/** 书架统计（骨架：书数由数据推导，数值来自实时统计）。 */
export interface ShelfStats {
  /** 累计字数（全书真实有效字数） */
  words: number
  /** 今日写作字数 */
  today: number
  /** 连续写作天数 */
  streak: number
}

/** 单本书真实统计（镜像主进程 BookStats，`api.stats.bookStatsAll` 的元素）。 */
export interface BookStats {
  chapters: number
  done: number
  words: number
  progress: number
}

/**
 * 用真实统计覆盖书籍列表的字数 / 章节数 / 进度（返回新数组，不修改入参）。
 * 统计表缺该书（如无章）时回退 0，避免展示种子书硬编码的旧值。
 */
export function mergeBookStats(books: readonly Book[], stats: Record<string, BookStats>): Book[] {
  return books.map((book) => {
    const stat = stats[book.id]
    if (!stat) return { ...book, words: 0, chapters: 0, progress: 0 }
    return { ...book, words: stat.words, chapters: stat.chapters, progress: stat.progress }
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

/** 按指定方式排序（返回新数组，不修改入参）。 */
export function sortBooks(books: readonly Book[], sort: ShelfSort): Book[] {
  const result = [...books]
  switch (sort) {
    case 'words':
      return result.sort((a, b) => b.words - a.words)
    case 'chapters':
      return result.sort((a, b) => b.chapters - a.chapters)
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
