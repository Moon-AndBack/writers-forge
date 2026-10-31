import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  ENTITY_TYPES,
  createEntity,
  deleteEntity,
  getEntity,
  getEntityRevision,
  listEntities,
  updateEntity
} from '../database/entities'
import type {
  CreateEntityInput,
  EntityRelationInput,
  EntityType,
  UpdateEntityPatch
} from '../database/entities'
import { matchEntities } from '../match/entityMatcher'

/** 实体域日志 scope。 */
const log = logger.scope('entities')

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

/** 判断是否为普通对象（用于校验 IPC 入参）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验实体类型是否为枚举成员。 */
function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && ENTITY_TYPES.includes(value as EntityType)
}

/** 解析可选别名数组：未提供返回 undefined，非法返回 null。 */
function readAliases(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null
  return value as string[]
}

/** 解析可选关系数组：未提供返回 undefined，非法返回 null。 */
function readRelations(value: unknown): EntityRelationInput[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const result: EntityRelationInput[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    if (typeof item.targetId !== 'number' || !Number.isInteger(item.targetId)) return null
    if (typeof item.relation !== 'string' || item.relation.trim() === '') return null
    result.push({ targetId: item.targetId, relation: item.relation })
  }
  return result
}

/** 解析创建入参；必填缺失或字段非法时返回 null。 */
function parseCreateInput(input: unknown): CreateEntityInput | null {
  if (!isRecord(input)) return null
  if (typeof input.bookId !== 'string' || input.bookId.trim() === '') return null
  if (typeof input.name !== 'string' || input.name.trim() === '') return null
  if (!isEntityType(input.type)) return null

  const aliases = readAliases(input.aliases)
  if (aliases === null) return null
  const relations = readRelations(input.relations)
  if (relations === null) return null

  const parsed: CreateEntityInput = {
    bookId: input.bookId,
    name: input.name,
    type: input.type
  }
  if (typeof input.description === 'string') parsed.description = input.description
  if (aliases !== undefined) parsed.aliases = aliases
  if (relations !== undefined) parsed.relations = relations
  return parsed
}

/** 解析更新补丁；字段非法返回 null，无任何可更新字段也返回 null。 */
function parseUpdatePatch(input: unknown): UpdateEntityPatch | null {
  if (!isRecord(input)) return null

  const patch: UpdateEntityPatch = {}
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim() === '') return null
    patch.name = input.name
  }
  if (input.type !== undefined) {
    if (!isEntityType(input.type)) return null
    patch.type = input.type
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string') return null
    patch.description = input.description
  }

  const aliases = readAliases(input.aliases)
  if (aliases === null) return null
  if (aliases !== undefined) patch.aliases = aliases

  const relations = readRelations(input.relations)
  if (relations === null) return null
  if (relations !== undefined) patch.relations = relations

  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * 实体域 IPC：通道前缀 `entities:`。
 *
 * 通道 → 入参 / 出参：
 * - entities:list    (bookId: string)                → EntityRow[]
 * - entities:get     (id: number)                    → EntityDetail | null
 * - entities:create  (input: CreateEntityInput)      → EntityDetail | null
 * - entities:update  (id: number, patch)             → EntityDetail | null
 * - entities:delete  (id: number)                    → boolean
 * - entities:match   (bookId: string, text: string)  → EntityMatch[]（词表取统一设定库主表）
 * - entities:revision(bookId: string)                → string（词表版本签名，供渲染层缓存失效）
 *
 * 说明：`entities:match` / `entities:revision` 的数据源已切换到统一设定库
 * （`world_entities` + `world_aliases`），通道名保留以兼容既有调用方；
 * 其余 `entities:*` CRUD 仍服务旧 `entities` 表（后续清理批次处理）。
 */
export function registerEntitiesIpc(): void {
  ipcMain.handle('entities:list', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string') return []
    return listEntities(bookId)
  })

  ipcMain.handle('entities:get', (_event, id: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id)) return null
    return getEntity(id)
  })

  ipcMain.handle('entities:create', (_event, input: unknown) => {
    const parsed = parseCreateInput(input)
    if (!parsed) {
      log.warn('entities:create 入参非法')
      return null
    }
    return runWrite('entities:create', { bookId: parsed.bookId }, () => createEntity(parsed))
  })

  ipcMain.handle('entities:update', (_event, id: unknown, patch: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id)) return null
    const parsed = parseUpdatePatch(patch)
    if (!parsed) {
      log.warn('entities:update 入参非法', { id })
      return null
    }
    return runWrite('entities:update', { id }, () => updateEntity(id, parsed))
  })

  ipcMain.handle('entities:delete', (_event, id: unknown) => {
    if (typeof id !== 'number' || !Number.isInteger(id)) return false
    return runWrite('entities:delete', { id }, () => deleteEntity(id))
  })

  ipcMain.handle('entities:match', (_event, bookId: unknown, text: unknown) => {
    if (typeof bookId !== 'string' || typeof text !== 'string') return []
    return matchEntities(bookId, text)
  })

  // 词表版本签名（统一设定库实体 / 别名任一变更即变）：供渲染层段落匹配缓存判定失效。
  ipcMain.handle('entities:revision', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string') return ''
    return getEntityRevision(bookId)
  })
}
