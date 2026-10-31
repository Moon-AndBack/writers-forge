import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  addWorldRef,
  listSemanticCodes,
  listWorldRefs,
  listWorldRefsTo,
  removeWorldRef,
  updateWorldRef
} from '../database/worldRefs'
import type { UpdateWorldRefPatch, WorldRefInput } from '../database/worldEntities'
import { isRecord } from './worldSubtypeFields'

/**
 * 统一设定库 IPC · **通用引用**（第 7 批自 `worldEntities.ts` 拆出，§3 单文件 ≤500 行）。
 *
 * 通道沿用既有 `worldEntity:` 前缀（与 `worldEntity:listRefs` 一致；brief 中写作
 * `worldRef:*`，此处按「现有风格扩展」的要求统一前缀）。
 *
 * - worldEntity:listRefs           (id, semanticCode?)  → WorldRefRow[]（出边）
 * - worldEntity:listIncomingRefs   (id, semanticCode?)  → WorldRefRow[]（入边）
 * - worldEntity:listSemanticCodes  ()                   → WorldSemanticCodeRow[]
 * - worldEntity:addRef             (input)              → WorldRefRow | null
 * - worldEntity:updateRef          (id, patch)          → WorldRefRow | null
 * - worldEntity:removeRef          (id)                 → boolean
 *
 * 入参校验口径：非法一律返回 `[]` / `null` / `false`，**不抛异常**；
 * 语义码是否存在、两端是否同书 / 未软删 / 非自指由数据层复核。
 */

/** 统一设定库日志 scope（与 `worldEntities.ts` 同名，便于日志按域聚类）。 */
const log = logger.scope('worldEntities')

/** 写操作包装：统一记录成功（debug）/ 失败（error），失败原样抛出。 */
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

/** 正整数（实体 id / 引用 id）。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 非负整数（排序）。 */
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 可选非空字符串（语义码）：未提供 → undefined；空串 / 非字符串 → null（非法）。 */
function readSemanticCode(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') return null
  return value.trim()
}

/** 可选字符串字段：未提供 → undefined；非字符串 → null（非法）。 */
function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : null
}

/** 可选可空字符串（有效期）：未提供 → { ok: true }；`null` / 字符串合法；其余 → { ok: false }。 */
function readOptionalNullableString(value: unknown): { ok: boolean; value?: string | null } {
  if (value === undefined) return { ok: true }
  if (value === null) return { ok: true, value: null }
  if (typeof value === 'string') return { ok: true, value }
  return { ok: false }
}

/**
 * 解析新增引用入参；两端 / 书 / 语义码非法返回 null。
 */
function parseRefInput(input: unknown): WorldRefInput | null {
  if (!isRecord(input)) return null
  if (typeof input.bookId !== 'string' || input.bookId.trim() === '') return null
  if (!isPositiveInt(input.fromId) || !isPositiveInt(input.toId)) return null
  if (input.fromId === input.toId) return null

  const semanticCode = readSemanticCode(input.semanticCode)
  if (typeof semanticCode !== 'string') return null

  const parsed: WorldRefInput = {
    bookId: input.bookId,
    fromId: input.fromId,
    toId: input.toId,
    semanticCode
  }
  const role = readOptionalString(input.role)
  if (role === null) return null
  if (role !== undefined) parsed.role = role
  const note = readOptionalString(input.note)
  if (note === null) return null
  if (note !== undefined) parsed.note = note
  if (input.sortOrder !== undefined) {
    if (!isNonNegativeInt(input.sortOrder)) return null
    parsed.sortOrder = input.sortOrder
  }
  const validFrom = readOptionalNullableString(input.validFrom)
  if (!validFrom.ok) return null
  if (validFrom.value !== undefined) parsed.validFrom = validFrom.value
  const validTo = readOptionalNullableString(input.validTo)
  if (!validTo.ok) return null
  if (validTo.value !== undefined) parsed.validTo = validTo.value

  return parsed
}

/** 解析更新补丁；字段非法或补丁为空返回 null。 */
function parseRefPatch(input: unknown): UpdateWorldRefPatch | null {
  if (!isRecord(input)) return null
  const patch: UpdateWorldRefPatch = {}

  const semanticCode = readSemanticCode(input.semanticCode)
  if (semanticCode === null) return null
  if (semanticCode !== undefined) patch.semanticCode = semanticCode

  const role = readOptionalString(input.role)
  if (role === null) return null
  if (role !== undefined) patch.role = role

  const note = readOptionalString(input.note)
  if (note === null) return null
  if (note !== undefined) patch.note = note

  if (input.sortOrder !== undefined) {
    if (!isNonNegativeInt(input.sortOrder)) return null
    patch.sortOrder = input.sortOrder
  }

  const validFrom = readOptionalNullableString(input.validFrom)
  if (!validFrom.ok) return null
  if (validFrom.value !== undefined) patch.validFrom = validFrom.value

  const validTo = readOptionalNullableString(input.validTo)
  if (!validTo.ok) return null
  if (validTo.value !== undefined) patch.validTo = validTo.value

  return Object.keys(patch).length > 0 ? patch : null
}

/** 可选语义码筛选项：未提供 / 非法 → undefined（不筛选），合法 → 码。 */
function readFilterCode(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** 注册通用引用通道（由 `registerWorldEntitiesIpc` 末尾调用）。 */
export function registerWorldRefsIpc(): void {
  ipcMain.handle('worldEntity:listRefs', (_event, id: unknown, semanticCode: unknown) => {
    if (!isPositiveInt(id)) return []
    return listWorldRefs(id, readFilterCode(semanticCode))
  })

  ipcMain.handle(
    'worldEntity:listIncomingRefs',
    (_event, id: unknown, semanticCode: unknown) => {
      if (!isPositiveInt(id)) return []
      return listWorldRefsTo(id, readFilterCode(semanticCode))
    }
  )

  ipcMain.handle('worldEntity:listSemanticCodes', () => listSemanticCodes())

  ipcMain.handle('worldEntity:addRef', (_event, input: unknown) => {
    const parsed = parseRefInput(input)
    if (!parsed) {
      log.warn('worldEntity:addRef 入参非法')
      return null
    }
    return runWrite('worldEntity:addRef', { fromId: parsed.fromId }, () => addWorldRef(parsed))
  })

  ipcMain.handle('worldEntity:updateRef', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = parseRefPatch(patch)
    if (!parsed) {
      log.warn('worldEntity:updateRef 入参非法', { id })
      return null
    }
    return runWrite('worldEntity:updateRef', { id }, () => updateWorldRef(id, parsed))
  })

  ipcMain.handle('worldEntity:removeRef', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('worldEntity:removeRef', { id }, () => removeWorldRef(id))
  })
}
