import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { logger } from '../logger'
import { getDb } from './index'
import { ensurePresetSubtypes } from './worldSubtypes'
import { deleteSetting, setSetting } from './settings'

/** 书籍域日志 scope。 */
const log = logger.scope('books')

/** 书籍状态六态：连载中 / 已完结 / 草稿 / 太监 / 暂停 / 修订中。 */
export type BookStatus = 'writing' | 'done' | 'draft' | 'dropped' | 'paused' | 'revising'

/** 书籍状态可选值（表单展示顺序，同时供后续 IPC 层做入参校验）。 */
export const BOOK_STATUSES: readonly BookStatus[] = [
  'writing',
  'done',
  'draft',
  'paused',
  'dropped',
  'revising'
]

/** 书籍频道：男频 / 女频 / 出版（对应起点频道）。 */
export type BookChannel = 'male' | 'female' | 'publish'

/** 书籍频道可选值。 */
export const BOOK_CHANNELS: readonly BookChannel[] = ['male', 'female', 'publish']

/** 书籍篇幅：长篇 / 中篇 / 短篇。 */
export type BookLength = 'long' | 'medium' | 'short'

/** 书籍篇幅可选值。 */
export const BOOK_LENGTHS: readonly BookLength[] = ['long', 'medium', 'short']

/** 封面色预设：有序 key + 对应渐变值。 */
export interface CoverColorOption {
  /** 稳定 key，持久化到 books.coverColor */
  key: string
  /** 中文展示名 */
  label: string
  /** CSS background-image 值（预设渐变） */
  value: string
  /** 纯色环 / 强调色，供渲染层选中态使用 */
  ring: string
}

/**
 * 封面色预设（8 组，有序）。前 6 组沿用 template/index.html 的 .cover-swatch
 * 渐变（其中 red 归入 rose 键），新增 teal / slate 两组，值与渲染层现有字面量保持一致。
 */
export const COVER_COLORS: readonly CoverColorOption[] = [
  {
    key: 'purple',
    label: '紫罗兰',
    value: 'linear-gradient(135deg, #5b4de8, #7d8cf5)',
    ring: '#5b4de8'
  },
  {
    key: 'blue',
    label: '天青',
    value: 'linear-gradient(135deg, #2f9ae0, #5fc0ec)',
    ring: '#2f9ae0'
  },
  {
    key: 'green',
    label: '松林',
    value: 'linear-gradient(135deg, #0f7b4f, #4ccfa4)',
    ring: '#0f7b4f'
  },
  {
    key: 'orange',
    label: '琥珀',
    value: 'linear-gradient(135deg, #9d5d00, #f2b357)',
    ring: '#9d5d00'
  },
  {
    key: 'violet',
    label: '暮紫',
    value: 'linear-gradient(135deg, #5c3a8a, #a86ad4)',
    ring: '#5c3a8a'
  },
  {
    key: 'teal',
    label: '湖绿',
    value: 'linear-gradient(135deg, #0f7b7b, #4ccfc4)',
    ring: '#0f7b7b'
  },
  {
    key: 'rose',
    label: '绯红',
    value: 'linear-gradient(135deg, #c42b1c, #ff7a6a)',
    ring: '#c42b1c'
  },
  {
    key: 'slate',
    label: '石板',
    value: 'linear-gradient(135deg, #475069, #94a0bd)',
    ring: '#475069'
  }
]

/** 默认封面色 key（预设第一组）。 */
const DEFAULT_COVER_COLOR = COVER_COLORS[0].key

/**
 * 时间线起点默认值：空串（中文默认名 / 默认起点不下沉到数据层，由展示层 i18n 兜底）。
 * settings 键按书隔离：`timeline:origin:<bookId>`（见渲染层 `timelineOrigin.ts`）。
 */
export const DEFAULT_TIMELINE_ORIGIN = ''

/**
 * 书籍领域对象：`categories` 为**分类 ID 列表**（`categories.id`，正整数），
 * 库内以 JSON 字符串（数字数组）存储。分类名称从 `categories.name` 取（不译项）。
 */
export interface BookRow {
  id: string
  title: string
  intro: string
  categories: number[]
  status: BookStatus
  /** 频道（男频 / 女频 / 出版）；null = 未设置。 */
  channel: BookChannel | null
  /** 篇幅（长篇 / 中篇 / 短篇）；null = 未设置。 */
  lengthType: BookLength | null
  words: number
  chapters: number
  progress: number
  coverChar: string
  coverColor: string
  createdAt: string
  updatedAt: string
}

/** 创建书籍入参：仅 `title` 必填，其余字段缺省由本模块补齐。 */
export interface CreateBookInput {
  id?: string
  title: string
  intro?: string
  categories?: number[]
  status?: BookStatus
  channel?: BookChannel | null
  lengthType?: BookLength | null
  words?: number
  chapters?: number
  progress?: number
  coverChar?: string
  coverColor?: string
}

/** 更新书籍补丁：仅允许可编辑字段，id / 时间戳由本模块维护。 */
export type UpdateBookPatch = Partial<
  Pick<
    BookRow,
    | 'title'
    | 'intro'
    | 'categories'
    | 'status'
    | 'channel'
    | 'lengthType'
    | 'words'
    | 'chapters'
    | 'progress'
    | 'coverChar'
    | 'coverColor'
  >
>

/** 数据库行：`categories` 为原始 JSON 字符串，`status` / `channel` / `lengthType` 为原始文本。 */
interface BookDbRow {
  id: string
  title: string
  intro: string
  categories: string
  status: string
  channel: string | null
  lengthType: string | null
  words: number
  chapters: number
  progress: number
  coverChar: string
  coverColor: string
  createdAt: string
  updatedAt: string
}

const SELECT_COLUMNS =
  'id, title, intro, categories, status, channel, lengthType, words, chapters, progress, coverChar, coverColor, createdAt, updatedAt'

/** patch 字段 → 数据库列名白名单（防止动态 SET 拼接注入）。 */
const UPDATE_COLUMNS: Record<keyof UpdateBookPatch, string> = {
  title: 'title',
  intro: 'intro',
  categories: 'categories',
  status: 'status',
  channel: 'channel',
  lengthType: 'lengthType',
  words: 'words',
  chapters: 'chapters',
  progress: 'progress',
  coverChar: 'coverChar',
  coverColor: 'coverColor'
}

/**
 * 反序列化分类 JSON → 分类 ID 列表，异常或非数组时回退空数组。
 *
 * 宽松过滤：只保留**正整数**元素（`categories.id` 为自增主键，必 ≥ 1）；
 * 非法元素（字符串 / 0 / 负数 / 小数 / null 等）静默丢弃，不阻断读取。
 * **不校验 ID 是否存在于 `categories` 表**：悬空 ID 由渲染层展示时按分类树过滤。
 */
function parseCategories(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is number => Number.isInteger(item) && (item as number) > 0)
      : []
  } catch (error) {
    // 库内 categories 字段损坏（非合法 JSON）：回退空数组，记录以定位脏数据。
    log.warn('categories 字段 JSON 解析失败，回退空数组', { rawLength: raw.length, error })
    return []
  }
}

/** 归一化状态：非法值回退 `writing`。 */
function coerceStatus(value: unknown): BookStatus {
  return BOOK_STATUSES.includes(value as BookStatus) ? (value as BookStatus) : 'writing'
}

/** 归一化频道：非法 / 缺失回退 null（未设置）。 */
function coerceChannel(value: unknown): BookChannel | null {
  return BOOK_CHANNELS.includes(value as BookChannel) ? (value as BookChannel) : null
}

/** 归一化篇幅：非法 / 缺失回退 null（未设置）。 */
function coerceLength(value: unknown): BookLength | null {
  return BOOK_LENGTHS.includes(value as BookLength) ? (value as BookLength) : null
}

/** 数据库行 → 领域对象。 */
function toBook(row: BookDbRow): BookRow {
  return {
    id: row.id,
    title: row.title,
    intro: row.intro,
    categories: parseCategories(row.categories),
    status: coerceStatus(row.status),
    channel: coerceChannel(row.channel),
    lengthType: coerceLength(row.lengthType),
    words: row.words,
    chapters: row.chapters,
    progress: row.progress,
    coverChar: row.coverChar,
    coverColor: row.coverColor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

/** 列表查询（按最近编辑倒序）。 */
export function listBooks(): BookRow[] {
  const statement: Database.Statement<[], BookDbRow> = getDb().prepare(
    `SELECT ${SELECT_COLUMNS} FROM books ORDER BY updatedAt DESC`
  )
  return statement.all().map(toBook)
}

/** 单本查询，不存在返回 null。 */
export function getBook(id: string): BookRow | null {
  const statement: Database.Statement<[string], BookDbRow> = getDb().prepare(
    `SELECT ${SELECT_COLUMNS} FROM books WHERE id = ?`
  )
  const row = statement.get(id)
  return row ? toBook(row) : null
}

/** 创建书籍：生成 id、补默认值、写默认时间线列表（名 / 起点空串）、写入后回读。 */
export function createBook(input: CreateBookInput): BookRow {
  const db = getDb()
  const id = input.id && input.id.length > 0 ? input.id : randomUUID()
  const title = input.title
  const categories = (input.categories ?? []).filter(
    (item): item is number => Number.isInteger(item) && item > 0
  )

  db.prepare(
    `INSERT INTO books
       (id, title, intro, categories, status, channel, lengthType, words, chapters, progress, coverChar, coverColor)
     VALUES
       (@id, @title, @intro, @categories, @status, @channel, @lengthType, @words, @chapters, @progress, @coverChar, @coverColor)`
  ).run({
    id,
    title,
    intro: input.intro ?? '',
    categories: JSON.stringify(categories),
    status: coerceStatus(input.status),
    channel: coerceChannel(input.channel),
    lengthType: coerceLength(input.lengthType),
    words: input.words ?? 0,
    chapters: input.chapters ?? 0,
    progress: input.progress ?? 0,
    coverChar: input.coverChar && input.coverChar.length > 0 ? input.coverChar : title.slice(0, 1),
    coverColor:
      input.coverColor && input.coverColor.length > 0 ? input.coverColor : DEFAULT_COVER_COLOR
  })

  // 新书即时写入 23 条预设子类分类（幂等；分类表真源见 schema/worldSubtypes.ts）。
  ensurePresetSubtypes(id)

  // 新书即有默认时间线：列表 + 选中 id（settings JSON），不再写老键 `timeline:origin:<id>`。
  setSetting(
    `timeline:list:${id}`,
    JSON.stringify([{ id: 'default', name: '', origin: DEFAULT_TIMELINE_ORIGIN }])
  )
  setSetting(`timeline:active:${id}`, 'default')
  const created = getBook(id)
  if (!created) {
    throw new Error('Failed to read back created book')
  }
  return created
}

/** 更新书籍：仅更新补丁中出现的字段，并刷新 updatedAt；不存在返回 null。 */
export function updateBook(id: string, patch: UpdateBookPatch): BookRow | null {
  const existing = getBook(id)
  if (!existing) return null

  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  for (const key of Object.keys(UPDATE_COLUMNS) as Array<keyof UpdateBookPatch>) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === undefined) continue
    sets.push(`${UPDATE_COLUMNS[key]} = @${key}`)
    params[key] = key === 'categories' ? JSON.stringify(value) : value
  }

  // 未提供任何可更新字段：保持原样返回，不触发无意义写入。
  if (sets.length === 0) return existing

  // updatedAt 使用毫秒精度，保证「最近编辑」排序与同秒连续编辑可区分。
  sets.push(`updatedAt = strftime('%Y-%m-%d %H:%M:%f', 'now')`)
  getDb()
    .prepare(`UPDATE books SET ${sets.join(', ')} WHERE id = @id`)
    .run(params)

  return getBook(id)
}

/** 删除书籍，返回是否命中；封面等域表由外键 ON DELETE CASCADE 联动删除，起点键无 FK 需手动清理。 */
export function deleteBook(id: string): boolean {
  // settings 键无 FK：先清该书时间线列表 / 选中键，避免 books 行删除后留下孤儿键。
  deleteSetting(`timeline:list:${id}`)
  deleteSetting(`timeline:active:${id}`)
  // 统一设定库 demo 播种标记同属 settings（无 FK）：删书时一并清掉，
  // 否则同 id 的书重建后（如教学书重灌）会因残留标记而跳过 demo 播种。
  deleteSetting(`worldEntities:seeded:${id}`)
  const result = getDb().prepare('DELETE FROM books WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

/**
 * 书籍种子（教学书机制）：教学书「Writer's Forge · 使用指南」由 `chapterSeed.ts` 的
 * `resetChapterDataOnce` 灌入（固定 id `guide`，含卷 / 章 / 大纲 / 正文）。
 * 本函数**不再**插入任何样例书：首次启动 = 空库 → 教学书重建流程建立唯一书籍；
 * 二次启动（标记已置位）→ books 表不动，尊重用户删书 / 建书的结果。
 * 保留空实现与调用点，保证 `database/index.ts` 装配顺序不动、幂等语义延续。
 */

/** 建表后调用：维持既有调用点（当前无书籍种子；教学书由章节种子流程负责）。 */
export function seedBooksIfEmpty(): void {
  // 教学书由 resetChapterDataOnce 灌入（见 chapterSeed.ts 文件头注释）；此处故意为空。
}
