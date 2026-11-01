import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  createWorldSubtype,
  deleteWorldSubtype,
  ensurePresetSubtypes,
  listWorldSubtypes,
  updateWorldSubtype
} from '../database/worldSubtypes'
import type {
  CreateWorldSubtypeInput,
  UpdateWorldSubtypePatch,
  WorldSubtypeDeleteOutcome,
  WorldSubtypeRow
} from '../database/worldSubtypes'
import { WORLD_ENTITY_TYPES } from '../database/worldEntityTypes'
import type { WorldEntityType } from '../database/worldEntityTypes'

/** 子类分类日志 scope。 */
const log = logger.scope('worldSubtypes')

/** 判断是否为普通对象（用于校验 IPC 入参）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 正整数（子类 id）。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 非负整数（排序）。 */
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 实体类型白名单（五类）。 */
function isEntityType(value: unknown): value is WorldEntityType {
  return typeof value === 'string' && WORLD_ENTITY_TYPES.includes(value as WorldEntityType)
}

/** 自定义标记：接受 boolean 或 0 / 1，统一归一化为 0 / 1；其余非法返回 null。 */
function readIsCustom(value: unknown): number | null {
  if (value === true || value === 1) return 1
  if (value === false || value === 0) return 0
  return null
}

/** 写操作兜底：失败只记日志并返回 fallback，绝不向渲染层抛异常。 */
function runWrite<T>(
  channel: string,
  context: Record<string, unknown>,
  fn: () => T,
  fallback: T
): T {
  try {
    const result = fn()
    log.debug(`${channel} 完成`, context)
    return result
  } catch (error) {
    // 唯一约束冲突（重名）等数据库错误在此收敛为 fallback。
    log.error(`${channel} 失败`, { ...context, error })
    return fallback
  }
}

/** 解析创建入参；必填缺失或字段非法返回 null。 */
function parseCreateInput(input: unknown): CreateWorldSubtypeInput | null {
  if (!isRecord(input)) return null
  if (typeof input.bookId !== 'string' || input.bookId.trim() === '') return null
  if (!isEntityType(input.entityType)) return null
  if (typeof input.name !== 'string' || input.name.trim() === '') return null

  const isCustom = readIsCustom(input.isCustom)
  if (isCustom === null) return null

  const parsed: CreateWorldSubtypeInput = {
    bookId: input.bookId,
    entityType: input.entityType,
    name: input.name.trim(),
    isCustom
  }
  if (input.presetKey !== undefined) {
    if (typeof input.presetKey !== 'string') return null
    parsed.presetKey = input.presetKey
  }
  if (input.sortOrder !== undefined) {
    if (!isNonNegativeInt(input.sortOrder)) return null
    parsed.sortOrder = input.sortOrder
  }
  return parsed
}

/** 解析更新补丁；字段非法或补丁为空返回 null。 */
function parseUpdatePatch(input: unknown): UpdateWorldSubtypePatch | null {
  if (!isRecord(input)) return null
  const patch: UpdateWorldSubtypePatch = {}

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim() === '') return null
    patch.name = input.name.trim()
  }
  if (input.sortOrder !== undefined) {
    if (!isNonNegativeInt(input.sortOrder)) return null
    patch.sortOrder = input.sortOrder
  }
  if (input.presetKey !== undefined) {
    if (typeof input.presetKey !== 'string') return null
    patch.presetKey = input.presetKey
  }

  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * 子类分类 IPC：通道前缀 `worldSubtype:`。
 *
 * - worldSubtype:list          (bookId, entityType?) → WorldSubtypeRow[]
 * - worldSubtype:create        (input)              → WorldSubtypeRow | null
 * - worldSubtype:update        (id, patch)          → WorldSubtypeRow | null
 * - worldSubtype:delete        (id)                 → WorldSubtypeDeleteOutcome
 *   （`{ ok: true }` / `inUse` 占用条数 / `notCustom` / `notFound` / `failed`）
 * - worldSubtype:ensurePresets (bookId)             → boolean（是否新建了预设行）
 */
export function registerWorldSubtypesIpc(): void {
  ipcMain.handle('worldSubtype:list', (_event, bookId: unknown, entityType: unknown) => {
    if (typeof bookId !== 'string' || bookId.trim() === '') return []
    if (entityType !== undefined && !isEntityType(entityType)) return []
    return listWorldSubtypes(bookId, entityType)
  })

  ipcMain.handle('worldSubtype:create', (_event, input: unknown) => {
    const parsed = parseCreateInput(input)
    if (!parsed) {
      log.warn('worldSubtype:create 入参非法')
      return null
    }
    return runWrite<WorldSubtypeRow | null>(
      'worldSubtype:create',
      { bookId: parsed.bookId, entityType: parsed.entityType },
      () => createWorldSubtype(parsed),
      null
    )
  })

  ipcMain.handle('worldSubtype:update', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = parseUpdatePatch(patch)
    if (!parsed) {
      log.warn('worldSubtype:update 入参非法', { id })
      return null
    }
    return runWrite<WorldSubtypeRow | null>(
      'worldSubtype:update',
      { id },
      () => updateWorldSubtype(id, parsed),
      null
    )
  })

  ipcMain.handle('worldSubtype:delete', (_event, id: unknown): WorldSubtypeDeleteOutcome => {
    if (!isPositiveInt(id)) {
      log.warn('worldSubtype:delete 入参非法', { id })
      return { ok: false, reason: 'notFound' }
    }
    try {
      const result = deleteWorldSubtype(id)
      if (result.ok) log.debug('worldSubtype:delete 成功', { id })
      else log.warn('worldSubtype:delete 未删除', { id, reason: result.reason })
      return result
    } catch (error) {
      // 本模块惯例：不向渲染层抛错，未预期异常收敛为 `failed`（渲染层给通用失败提示）。
      log.error('worldSubtype:delete 失败', { id, error })
      return { ok: false, reason: 'failed' }
    }
  })

  ipcMain.handle('worldSubtype:ensurePresets', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId.trim() === '') return false
    return runWrite(
      'worldSubtype:ensurePresets',
      { bookId },
      () => ensurePresetSubtypes(bookId),
      false
    )
  })
}
