import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  MAX_INSPIRATION_TAGS,
  MAX_INSPIRATION_TAG_CHARS,
  createInspiration,
  deleteInspiration,
  listInspirationTags,
  listInspirations,
  updateInspiration,
  type InspirationCreatePayload,
  type InspirationUpdatePatch
} from '../database/inspirations'

/** 灵感域日志 scope。 */
const log = logger.scope('inspiration')

/** 写操作包装：执行数据库写并统一记录成功（debug）/ 失败（error）；失败原样抛出。 */
function runWrite<T>(channel: string, context: Record<string, unknown>, fn: () => T): T {
  try {
    const result = fn()
    log.debug(`${channel} 完成`, context)
    return result
  } catch (error) {
    log.error(`${channel} 失败`, { ...context, error })
    throw error
  }
}

/** 校验正整数 id。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** `books.id` 为 TEXT（UUID 级），200 字符上限与 `ipc/aiValidate.ts` 的 `MAX_ID_CHARS` 对齐。 */
const MAX_BOOK_ID_CHARS = 200

/** 标题上限（字符数）：灵感标题是短标签式短语，超长直接截断而非拒包。 */
const MAX_TITLE_CHARS = 200

/**
 * 正文上限（字符数）：灵感是碎片速记，不是章节正文；5 万字符已远超单条碎片量级，
 * 超限视为异常入参并**整包拒绝**（避免静默截断丢失用户内容）。
 */
const MAX_CONTENT_CHARS = 50_000

/** 消毒标签数组：必须是字符串数组且条数不超上限；非字符串项 / 超长数组 → undefined（整包拒绝）。 */
function sanitizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_INSPIRATION_TAGS) return undefined
  if (value.some((item) => typeof item !== 'string')) return undefined
  return value as string[]
}

/**
 * 消毒创建入参：`undefined` 视为空载荷 `{}`（允许先建空条目再补内容）；
 * 非对象 / 字段类型错误 / 正文超长 → undefined（调用方回 null）。
 */
function sanitizeCreatePayload(value: unknown): InspirationCreatePayload | undefined {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.title !== undefined && typeof record.title !== 'string') return undefined
  if (record.content !== undefined && typeof record.content !== 'string') return undefined
  const content = typeof record.content === 'string' ? record.content : undefined
  if (content !== undefined && content.length > MAX_CONTENT_CHARS) return undefined
  const tags = record.tags === undefined ? undefined : sanitizeTags(record.tags)
  if (record.tags !== undefined && tags === undefined) return undefined

  const payload: InspirationCreatePayload = {}
  if (typeof record.title === 'string') payload.title = record.title.slice(0, MAX_TITLE_CHARS)
  if (content !== undefined) payload.content = content
  if (tags !== undefined) payload.tags = tags
  return payload
}

/** 消毒更新补丁：字段缺省保持不变；空补丁 `{}` 合法（不写库）；畸形 → undefined。 */
function sanitizeUpdatePatch(value: unknown): InspirationUpdatePatch | undefined {
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const patch: InspirationUpdatePatch = {}
  const record = value as Record<string, unknown>
  if (record.title !== undefined) {
    if (typeof record.title !== 'string') return undefined
    patch.title = record.title.slice(0, MAX_TITLE_CHARS)
  }
  if (record.content !== undefined) {
    if (typeof record.content !== 'string' || record.content.length > MAX_CONTENT_CHARS) {
      return undefined
    }
    patch.content = record.content
  }
  if (record.tags !== undefined) {
    const tags = sanitizeTags(record.tags)
    if (tags === undefined) return undefined
    patch.tags = tags
  }
  return patch
}

/**
 * 灵感域 IPC：通道前缀 `inspiration:`。
 *
 * 通道 → 入参 / 出参（非法入参回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - inspiration:list   (bookId: string, tag?: string) → InspirationRow[]
 *   （`updated_at DESC, id DESC`；`tag` 非空时只返回带该标签的条目，
 *    非法 / 超长标签回空数组）
 * - inspiration:tags   (bookId: string)               → string[]（去重标签，供筛选）
 * - inspiration:create (bookId: string, payload?: { title?, content?, tags? })
 *                                                     → InspirationRow | null
 * - inspiration:update (id: number, patch?: { title?, content?, tags? })
 *                                                     → InspirationRow | null
 * - inspiration:delete (id: number)                  → boolean（永久删除）
 *
 * 标签约束：最多 20 个、单个最长 40 字符（去空白 / 去重 / 截断在数据层统一执行）；
 * 标题超长截断到 200 字符，正文超 5 万字符整包拒绝。
 */
export function registerInspirationsIpc(): void {
  ipcMain.handle('inspiration:list', (_event, bookId: unknown, tag: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || bookId.length > MAX_BOOK_ID_CHARS) return []
    const filter = typeof tag === 'string' ? tag.trim() : ''
    // 非空但超长 / 非字符串的标签视为非法入参：回空数组而非退回全量列表。
    if (filter !== '' && filter.length > MAX_INSPIRATION_TAG_CHARS) return []
    return listInspirations(bookId, filter === '' ? undefined : filter)
  })

  ipcMain.handle('inspiration:tags', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || bookId.length > MAX_BOOK_ID_CHARS) return []
    return listInspirationTags(bookId)
  })

  ipcMain.handle('inspiration:create', (_event, bookId: unknown, payload: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || bookId.length > MAX_BOOK_ID_CHARS) {
      return null
    }
    const parsed = sanitizeCreatePayload(payload)
    if (parsed === undefined) {
      log.warn('inspiration:create 入参消毒失败回 null', { bookId })
      return null
    }
    return runWrite('inspiration:create', { bookId }, () => createInspiration(bookId, parsed))
  })

  ipcMain.handle('inspiration:update', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = sanitizeUpdatePatch(patch)
    if (parsed === undefined) {
      log.warn('inspiration:update 入参消毒失败回 null', { id })
      return null
    }
    return runWrite('inspiration:update', { id }, () => updateInspiration(id, parsed))
  })

  ipcMain.handle('inspiration:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('inspiration:delete', { id }, () => deleteInspiration(id))
  })
}
