import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  createForeshadow,
  deleteForeshadow,
  getForeshadow,
  listForeshadows,
  listForeshadowsByChapter,
  listForeshadowsByOutlineItem,
  listForeshadowsByRecoverAnchorChapter,
  listForeshadowsByRecoverAnchorOutlineItem,
  updateForeshadow,
  type ForeshadowAnchor,
  type ForeshadowAnchorKind,
  type ForeshadowCreatePayload,
  type ForeshadowStatus,
  type ForeshadowUpdatePatch
} from '../database/foreshadows'

/** 伏笔域日志 scope。 */
const log = logger.scope('foreshadow')

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

/** 校验非空字符串（去空白后）。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 校验可选非负整数：undefined / null / 0 以上整数。 */
function isOptionalIndex(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0)
  )
}

/** 校验可选正整数 id：undefined / null / 正整数。 */
function isOptionalPositiveInt(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isPositiveInt(value)
}

const FORESHADOW_STATUSES: readonly string[] = ['planted', 'recovered', 'abandoned']
const FORESHADOW_ANCHOR_KINDS: readonly string[] = ['chapter', 'outline', 'none']

function isForeshadowStatus(value: unknown): value is ForeshadowStatus {
  return typeof value === 'string' && FORESHADOW_STATUSES.includes(value)
}

function isAnchorKind(value: unknown): value is ForeshadowAnchorKind {
  return typeof value === 'string' && FORESHADOW_ANCHOR_KINDS.includes(value)
}

/**
 * 消毒锚点入参：undefined / null 原样返回；纯对象且字段类型合法 → 归一化对象；
 * 畸形 → undefined（调用方整包拒绝）。语义约束（目标是否同书）由数据层校验。
 * 埋设锚点与回收点锚点结构完全相同，故两者共用本函数（回收点复用同一份消毒逻辑）。
 */
function sanitizeAnchor(value: unknown): ForeshadowAnchor | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (!isAnchorKind(record.kind)) return undefined
  if (
    !isOptionalPositiveInt(record.chapterId) ||
    !isOptionalPositiveInt(record.outlineItemId) ||
    !isOptionalIndex(record.paragraphIdx) ||
    !isOptionalIndex(record.charStart) ||
    !isOptionalIndex(record.charEnd) ||
    (record.quote !== undefined && typeof record.quote !== 'string')
  ) {
    return undefined
  }
  const anchor: ForeshadowAnchor = { kind: record.kind }
  if (typeof record.chapterId === 'number') anchor.chapterId = record.chapterId
  if (record.chapterId === null) anchor.chapterId = null
  if (typeof record.outlineItemId === 'number') anchor.outlineItemId = record.outlineItemId
  if (record.outlineItemId === null) anchor.outlineItemId = null
  if (typeof record.paragraphIdx === 'number') anchor.paragraphIdx = record.paragraphIdx
  if (record.paragraphIdx === null) anchor.paragraphIdx = null
  if (typeof record.quote === 'string') anchor.quote = record.quote
  if (typeof record.charStart === 'number') anchor.charStart = record.charStart
  if (record.charStart === null) anchor.charStart = null
  if (typeof record.charEnd === 'number') anchor.charEnd = record.charEnd
  if (record.charEnd === null) anchor.charEnd = null
  return anchor
}

/** 消毒创建入参：标题须非空；其余字段可选，畸形 → undefined。 */
function sanitizeCreatePayload(value: unknown): ForeshadowCreatePayload | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (!isNonEmptyString(record.title)) return undefined
  if (record.description !== undefined && typeof record.description !== 'string') return undefined
  if (record.status !== undefined && !isForeshadowStatus(record.status)) return undefined
  const anchor = sanitizeAnchor(record.anchor)
  if (record.anchor !== undefined && anchor === undefined) return undefined
  const payload: ForeshadowCreatePayload = { title: record.title }
  if (typeof record.description === 'string') payload.description = record.description
  if (isForeshadowStatus(record.status)) payload.status = record.status
  if (anchor !== undefined && anchor !== null) payload.anchor = anchor
  return payload
}

/** 消毒更新补丁：字段缺省不变；`anchor` / `recoverAnchor` 为 null 清除对应锚点；畸形 → undefined。 */
function sanitizeUpdatePatch(value: unknown): ForeshadowUpdatePatch | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.title !== undefined && !isNonEmptyString(record.title)) return undefined
  if (record.description !== undefined && typeof record.description !== 'string') return undefined
  if (record.recoveryNote !== undefined && typeof record.recoveryNote !== 'string') return undefined
  if (record.status !== undefined && !isForeshadowStatus(record.status)) return undefined
  const anchor = sanitizeAnchor(record.anchor)
  if (record.anchor !== undefined && anchor === undefined) return undefined
  const recoverAnchor = sanitizeAnchor(record.recoverAnchor)
  if (record.recoverAnchor !== undefined && recoverAnchor === undefined) return undefined
  const patch: ForeshadowUpdatePatch = {}
  if (typeof record.title === 'string') patch.title = record.title
  if (typeof record.description === 'string') patch.description = record.description
  if (typeof record.recoveryNote === 'string') patch.recoveryNote = record.recoveryNote
  if (isForeshadowStatus(record.status)) patch.status = record.status
  if (record.anchor !== undefined) patch.anchor = anchor ?? null
  if (record.recoverAnchor !== undefined) patch.recoverAnchor = recoverAnchor ?? null
  return patch
}

/**
 * 伏笔域 IPC：通道前缀 `foreshadow:`。锚点存快照（章 / 大纲条目 + 段落序号 + 原文摘录
 * + 段内字符区间），**不存 `paragraph_id`**（段落每次保存 id 全变）。
 *
 * 通道 → 入参 / 出参（非法入参一律回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - foreshadow:list         (bookId: string)                       → ForeshadowRow[]（未删除，
 *                                                                     `updated_at DESC`）
 * - foreshadow:get          (id: number)                           → ForeshadowRow | null
 * - foreshadow:create       (bookId: string, payload: { title, description?, status?,
 *                            anchor?: { kind, chapterId?, outlineItemId?, paragraphIdx?,
 *                            quote?, charStart?, charEnd? } })      → ForeshadowRow | null
 * - foreshadow:update       (id: number, patch?: { title?, description?, recoveryNote?,
 *                            status?, anchor?: … | null,
 *                            recoverAnchor?: … | null })         → ForeshadowRow | null
 * - foreshadow:delete       (id: number)                           → boolean（软删除）
 * - foreshadow:listByAnchor (chapterId?: number, outlineItemId?: number) → ForeshadowRow[]
 *   （两者都给时优先 chapterId；都非法 → 空数组；供后续批次正文标记使用）
 * - foreshadow:listByRecoverAnchor (chapterId?: number, outlineItemId?: number) → ForeshadowRow[]
 *   （**回收点**锚点反查；独立通道而非给 listByAnchor 加参数：正文里埋设处与回收处是
 *    两套互不替代的标记，调用方通常只查其中一类，独立通道语义清晰、无判别参数）
 */
export function registerForeshadowsIpc(): void {
  ipcMain.handle('foreshadow:list', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listForeshadows(bookId)
  })

  ipcMain.handle('foreshadow:get', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return null
    return getForeshadow(id)
  })

  ipcMain.handle('foreshadow:create', (_event, bookId: unknown, payload: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return null
    const parsed = sanitizeCreatePayload(payload)
    if (parsed === undefined) {
      log.warn('foreshadow:create 入参消毒失败回 null', { bookId })
      return null
    }
    return runWrite('foreshadow:create', { bookId }, () => createForeshadow(bookId, parsed))
  })

  ipcMain.handle('foreshadow:update', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = sanitizeUpdatePatch(patch)
    if (parsed === undefined) {
      log.warn('foreshadow:update 入参消毒失败回 null', { id })
      return null
    }
    return runWrite('foreshadow:update', { id }, () => updateForeshadow(id, parsed))
  })

  ipcMain.handle('foreshadow:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('foreshadow:delete', { id }, () => deleteForeshadow(id))
  })

  ipcMain.handle(
    'foreshadow:listByAnchor',
    (_event, chapterId: unknown, outlineItemId: unknown) => {
      if (isPositiveInt(chapterId)) return listForeshadowsByChapter(chapterId)
      if (isPositiveInt(outlineItemId)) return listForeshadowsByOutlineItem(outlineItemId)
      return []
    }
  )

  ipcMain.handle(
    'foreshadow:listByRecoverAnchor',
    (_event, chapterId: unknown, outlineItemId: unknown) => {
      if (isPositiveInt(chapterId)) return listForeshadowsByRecoverAnchorChapter(chapterId)
      if (isPositiveInt(outlineItemId)) {
        return listForeshadowsByRecoverAnchorOutlineItem(outlineItemId)
      }
      return []
    }
  )
}
