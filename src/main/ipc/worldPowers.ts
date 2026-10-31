import { ipcMain } from 'electron'
import { logger } from '../logger'
import { updatePowerSystem } from '../database/worldEntities'
import type { UpdateWorldPowerSystemPatch } from '../database/worldEntities'

/** 境界体系 IPC 日志 scope。 */
const log = logger.scope('worldPowers')

/** 写操作包装：统一记录成功 / 失败，失败原样抛出。 */
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 可选字符串：未提供 → undefined；非字符串 → null（非法）。 */
function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : null
}

/**
 * 解析体系补丁：第 6 批起只有 `kind`（体系类型）。
 * 简介列已下线（见 `database/worldEntitiesDropSummary.ts`），体系说明后续走正文。
 */
function parseSystemPatch(input: unknown): UpdateWorldPowerSystemPatch | null {
  if (!isRecord(input)) return null
  const patch: UpdateWorldPowerSystemPatch = {}
  const kind = readOptionalString(input.kind)
  if (kind === null) return null
  if (kind !== undefined) patch.kind = kind
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * 境界体系写 IPC（通道前缀 `worldEntity:`，与统一设定库共前缀）：
 * - updatePowerSystem (entityId, { kind }) → WorldPowerSystemRow | null
 *
 * 渠道 / 层级 / 晋升边 / 角色境界通道已随对应表于第 6 批下线。
 */
export function registerWorldPowersIpc(): void {
  ipcMain.handle('worldEntity:updatePowerSystem', (_event, entityId: unknown, patch: unknown) => {
    if (!isPositiveInt(entityId)) return null
    const parsed = parseSystemPatch(patch)
    if (!parsed) {
      log.warn('worldEntity:updatePowerSystem 入参非法', { entityId })
      return null
    }
    return runWrite('worldEntity:updatePowerSystem', { entityId }, () =>
      updatePowerSystem(entityId, parsed)
    )
  })
}
