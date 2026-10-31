import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  BOOK_CHANNELS,
  BOOK_LENGTHS,
  BOOK_STATUSES,
  createBook,
  deleteBook,
  getBook,
  listBooks,
  updateBook
} from '../database/books'
import type {
  BookChannel,
  BookLength,
  BookStatus,
  CreateBookInput,
  UpdateBookPatch
} from '../database/books'
import { listCategories } from '../database/categories'
import { deleteCover, getCover, setCover } from '../database/covers'

/** 书籍域日志 scope。 */
const log = logger.scope('books')

/** 创建 / 更新补丁中可出现的字段分组。 */
const STRING_KEYS = ['title', 'intro', 'coverChar', 'coverColor'] as const
const NUMERIC_KEYS = ['words', 'chapters', 'progress'] as const

/** 判断是否为普通对象（用于校验 IPC 入参）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 兜底清洗分类 ID 集合：去重 → 主-子互斥（集合含某一级 id 时剔除其全部二级 id）。
 *
 * 父子关系以 `categories.parent_id` 为准，避免「同主混形态」：两处同时出现时保留主分类、
 * 去掉子分类。仅做减法，不新增 id；返回新数组并保持首次出现顺序。
 */
function sanitizeCategories(ids: number[]): number[] {
  const unique = Array.from(new Set(ids))
  if (unique.length < 2) return unique

  const childrenOf = new Map<number, number[]>()
  for (const row of listCategories()) {
    if (row.parentId === null) continue
    const bucket = childrenOf.get(row.parentId)
    if (bucket) bucket.push(row.id)
    else childrenOf.set(row.parentId, [row.id])
  }
  if (childrenOf.size === 0) return unique

  const dropped = new Set<number>()
  for (const id of unique) {
    for (const child of childrenOf.get(id) ?? []) dropped.add(child)
  }
  return dropped.size === 0 ? unique : unique.filter((id) => !dropped.has(id))
}

/** 校验可选分类 ID 数组：合法返回清洗后的 number[]，非法返回 null，未提供返回 undefined。 */
function readCategories(value: unknown): number[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  if (!value.every((item) => Number.isInteger(item) && (item as number) > 0)) return null
  const normalized = sanitizeCategories(value as number[])
  if (normalized.length !== value.length) {
    log.warn('books:categories 入参已兜底清洗', { input: value, normalized })
  }
  return normalized
}

/** 校验状态是否落在六态白名单内（白名单真源 `database/books.ts`）。 */
function isBookStatus(value: unknown): value is BookStatus {
  return typeof value === 'string' && BOOK_STATUSES.includes(value as BookStatus)
}

/**
 * 校验可选枚举字段（频道 / 篇幅）：
 * - 未提供 → `{ ok: true, provided: false }`；
 * - 显式 `null`（清空）→ `{ ok: true, provided: true, value: null }`；
 * - 合法枚举值 → `{ ok: true, provided: true, value }`；
 * - 其余（含非字符串 / 不在白名单）→ `{ ok: false }`。
 */
function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): { ok: boolean; provided: boolean; value: T | null } {
  if (value === undefined) return { ok: true, provided: false, value: null }
  if (value === null) return { ok: true, provided: true, value: null }
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return { ok: true, provided: true, value: value as T }
  }
  return { ok: false, provided: true, value: null }
}

/** 解析创建入参；标题缺失 / 字段类型非法时返回 null。 */
function parseCreateInput(input: unknown): CreateBookInput | null {
  if (!isRecord(input)) return null
  if (typeof input.title !== 'string' || input.title.trim() === '') return null

  const categories = readCategories(input.categories)
  if (categories === null) return null

  const channel = readEnum<BookChannel>(input.channel, BOOK_CHANNELS)
  if (!channel.ok) return null
  const lengthType = readEnum<BookLength>(input.lengthType, BOOK_LENGTHS)
  if (!lengthType.ok) return null

  const patch: CreateBookInput = { title: input.title }
  if (typeof input.id === 'string') patch.id = input.id
  if (typeof input.intro === 'string') patch.intro = input.intro
  if (categories !== undefined) patch.categories = categories
  if (input.status !== undefined) {
    if (!isBookStatus(input.status)) return null
    patch.status = input.status
  }
  if (channel.provided) patch.channel = channel.value
  if (lengthType.provided) patch.lengthType = lengthType.value
  if (typeof input.coverChar === 'string') patch.coverChar = input.coverChar
  if (typeof input.coverColor === 'string') patch.coverColor = input.coverColor

  for (const key of NUMERIC_KEYS) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    patch[key] = value
  }
  return patch
}

/** 解析更新补丁；字段类型非法时返回 null，无任何可更新字段时返回 null。 */
function parseUpdatePatch(input: unknown): UpdateBookPatch | null {
  if (!isRecord(input)) return null

  const categories = readCategories(input.categories)
  if (categories === null) return null

  const channel = readEnum<BookChannel>(input.channel, BOOK_CHANNELS)
  if (!channel.ok) return null
  const lengthType = readEnum<BookLength>(input.lengthType, BOOK_LENGTHS)
  if (!lengthType.ok) return null

  const patch: UpdateBookPatch = {}
  for (const key of STRING_KEYS) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value !== 'string') return null
    patch[key] = value
  }
  if (input.status !== undefined) {
    if (!isBookStatus(input.status)) return null
    patch.status = input.status
  }
  if (channel.provided) patch.channel = channel.value
  if (lengthType.provided) patch.lengthType = lengthType.value
  for (const key of NUMERIC_KEYS) {
    const value = input[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value)) return null
    patch[key] = value
  }
  if (categories !== undefined) patch.categories = categories

  return Object.keys(patch).length > 0 ? patch : null
}

/** 封面二进制入参 → Buffer；支持 ArrayBuffer 与任意 TypedArray / DataView。 */
function toBuffer(data: unknown): Buffer | null {
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

/** 书籍域 IPC：通道前缀 `books:` / `books:cover:`。 */
export function registerBooksIpc(): void {
  ipcMain.handle('books:list', () => listBooks())

  ipcMain.handle('books:get', (_event, id: unknown) => {
    if (typeof id !== 'string') return null
    return getBook(id)
  })

  ipcMain.handle('books:create', (_event, input: unknown) => {
    const parsed = parseCreateInput(input)
    if (!parsed) {
      log.warn('books:create 入参非法', { input })
      return null
    }
    try {
      const created = createBook(parsed)
      log.debug('books:create 成功', { id: created.id })
      return created
    } catch (error) {
      log.error('books:create 失败', { title: parsed.title, error })
      throw error
    }
  })

  ipcMain.handle('books:update', (_event, id: unknown, patch: unknown) => {
    if (typeof id !== 'string') return null
    const parsed = parseUpdatePatch(patch)
    if (!parsed) {
      log.warn('books:update 入参非法', { id, keys: Object.keys((patch as object) ?? {}) })
      return null
    }
    try {
      const updated = updateBook(id, parsed)
      if (updated) log.debug('books:update 成功', { id })
      else log.warn('books:update 未命中', { id })
      return updated
    } catch (error) {
      log.error('books:update 失败', { id, error })
      throw error
    }
  })

  ipcMain.handle('books:delete', (_event, id: unknown) => {
    if (typeof id !== 'string') return false
    try {
      const ok = deleteBook(id)
      if (ok) log.info('books:delete 成功', { id })
      else log.warn('books:delete 未命中', { id })
      return ok
    } catch (error) {
      log.error('books:delete 失败', { id, error })
      throw error
    }
  })

  ipcMain.handle('books:cover:get', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string') return null
    const cover = getCover(bookId)
    if (!cover) return null
    // 转为 Uint8Array 以便 structured clone 跨 IPC 传输（Buffer 亦然，此处显式统一）。
    return { mime: cover.mime, data: new Uint8Array(cover.data) }
  })

  ipcMain.handle('books:cover:set', (_event, bookId: unknown, mime: unknown, data: unknown) => {
    if (typeof bookId !== 'string' || typeof mime !== 'string') return false
    const buffer = toBuffer(data)
    if (!buffer) {
      log.warn('books:cover:set 封面数据非法', { bookId, mime })
      return false
    }
    try {
      setCover(bookId, mime, buffer)
      // 仅记录长度，不记录二进制内容。
      log.debug('books:cover:set 成功', { bookId, mime, bytes: buffer.byteLength })
      return true
    } catch (error) {
      log.error('books:cover:set 失败', { bookId, mime, bytes: buffer.byteLength, error })
      throw error
    }
  })

  ipcMain.handle('books:cover:delete', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string') return false
    try {
      const ok = deleteCover(bookId)
      if (ok) log.debug('books:cover:delete 成功', { bookId })
      else log.warn('books:cover:delete 未命中', { bookId })
      return ok
    } catch (error) {
      log.error('books:cover:delete 失败', { bookId, error })
      throw error
    }
  })
}
