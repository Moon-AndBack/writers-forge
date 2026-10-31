import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  FACTION_SUBTYPE_FIELDS,
  ITEM_SUBTYPE_FIELDS,
  WORLD_ENTITY_TYPES,
  createWorldEntity,
  deleteWorldEntity,
  getWorldEntity,
  getWorldText,
  listPowerSystems,
  listWorldAliases,
  listWorldEntities,
  listWorldTags,
  saveWorldText,
  setWorldAliases,
  setWorldTags,
  updateWorldEntity
} from '../database/worldEntities'
import type {
  CreateWorldEntityInput,
  UpdateWorldEntityPatch,
  WorldEntitySubtypeRef,
  WorldEntityType
} from '../database/worldEntities'
import { resolveDefaultSubtypeId, resolveEntitySubtype } from '../database/worldSubtypes'
import { registerWorldPowersIpc } from './worldPowers'
import { registerWorldRefsIpc } from './worldRefs'
import {
  allFieldKeys,
  isRecord,
  readCustomFields,
  readSubtypeFields,
  readWorldviewFields,
  validateSubtypeFields
} from './worldSubtypeFields'

/** 统一设定库日志 scope。 */
const log = logger.scope('worldEntities')

/** 正文 / 富文本 JSON 单字段长度上限（2 MB 字符数）：超限一律视为非法入参。 */
const MAX_TEXT_LENGTH = 2 * 1024 * 1024

/** 正文文本字段校验：字符串且不超过长度上限。 */
function isTextWithinLimit(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH
}

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

/** 正整数（实体 id / 父级 id）。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 非负整数（等级档位 / 排序）。 */
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isEntityType(value: unknown): value is WorldEntityType {
  return typeof value === 'string' && WORLD_ENTITY_TYPES.includes(value as WorldEntityType)
}

/** 解析可选字符串数组：未提供返回 undefined，非法返回 null。 */
function readStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null
  return value as string[]
}

/** 可选字符串字段：未提供 → undefined；非字符串 → null（非法）。 */
function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : null
}

/** 可选 id 字段（子类分类 id）：未提供 → { ok: true }；显式 null → value null；非法 → { ok: false }。 */
function readOptionalId(value: unknown): { ok: boolean; value?: number | null } {
  if (value === undefined) return { ok: true }
  if (value === null) return { ok: true, value: null }
  if (isPositiveInt(value)) return { ok: true, value }
  return { ok: false }
}

/** 解析创建入参；必填缺失或字段非法时返回 null。 */
function parseCreateInput(input: unknown): CreateWorldEntityInput | null {
  if (!isRecord(input)) return null
  if (typeof input.bookId !== 'string' || input.bookId.trim() === '') return null
  if (typeof input.name !== 'string' || input.name.trim() === '') return null
  if (!isEntityType(input.entityType)) return null

  const parsed: CreateWorldEntityInput = {
    bookId: input.bookId,
    entityType: input.entityType,
    name: input.name
  }

  const role = readOptionalString(input.role)
  if (role === null) return null
  if (role !== undefined) parsed.role = role
  // `kind` 已废弃：IPC 不再解析，入参中即使出现也被忽略。
  const grade = readOptionalString(input.grade)
  if (grade === null) return null
  if (grade !== undefined) parsed.grade = grade
  const body = readOptionalString(input.body)
  if (body === null || (body !== undefined && body.length > MAX_TEXT_LENGTH)) return null
  if (body !== undefined) parsed.body = body
  const bodyJson = readOptionalString(input.bodyJson)
  if (bodyJson === null || (bodyJson !== undefined && bodyJson.length > MAX_TEXT_LENGTH)) return null
  if (bodyJson !== undefined) parsed.bodyJson = bodyJson

  if (input.rank !== undefined) {
    if (!isNonNegativeInt(input.rank)) return null
    parsed.rank = input.rank
  }

  const subtype = readOptionalId(input.subtypeId)
  if (!subtype.ok) return null
  if (subtype.value !== undefined) parsed.subtypeId = subtype.value

  const aliases = readStringArray(input.aliases)
  if (aliases === null) return null
  if (aliases !== undefined) parsed.aliases = aliases
  const tags = readStringArray(input.tags)
  if (tags === null) return null
  if (tags !== undefined) parsed.tags = tags

  // 子类专属字段：解析期只做「该类型全部预设子类并集」初筛，
  // 生效子类（`preset_key`）由 create handler 解析 `subtypeId` 后做最终校验。
  const worldviewFields = readWorldviewFields(input.worldviewFields, undefined)
  if (worldviewFields === null) return null
  if (worldviewFields !== undefined) parsed.worldviewFields = worldviewFields

  const itemFields = readSubtypeFields(input.itemFields, allFieldKeys(ITEM_SUBTYPE_FIELDS))
  if (itemFields === null) return null
  if (itemFields !== undefined) parsed.itemFields = itemFields

  const factionFields = readSubtypeFields(input.factionFields, allFieldKeys(FACTION_SUBTYPE_FIELDS))
  if (factionFields === null) return null
  if (factionFields !== undefined) parsed.factionFields = factionFields

  // 用户自定义类型字段（第 5 批）：动态键值数组，边界由 `readCustomFields` 校验；
  // 实体必须是 item / faction 的自定义子类，由生效期 `validateSubtypeFields` 复核。
  const customFields = readCustomFields(input.customFields)
  if (customFields === null) return null
  if (customFields !== undefined) parsed.customFields = customFields

  return parsed
}

/** 解析更新补丁；字段非法或补丁为空返回 null。 */
function parseUpdatePatch(input: unknown): UpdateWorldEntityPatch | null {
  if (!isRecord(input)) return null
  const patch: UpdateWorldEntityPatch = {}

  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim() === '') return null
    patch.name = input.name
  }
  if (input.subtypeId !== undefined) {
    const subtype = readOptionalId(input.subtypeId)
    if (!subtype.ok) return null
    if (subtype.value !== undefined) patch.subtypeId = subtype.value
  }
  if (input.role !== undefined) {
    if (typeof input.role !== 'string') return null
    patch.role = input.role
  }
  // `kind` 已废弃：IPC 不再解析，入参中即使出现也被忽略。
  if (input.powerKind !== undefined) {
    if (typeof input.powerKind !== 'string') return null
    patch.powerKind = input.powerKind
  }
  if (input.grade !== undefined) {
    if (typeof input.grade !== 'string') return null
    patch.grade = input.grade
  }
  if (input.rank !== undefined) {
    if (!isNonNegativeInt(input.rank)) return null
    patch.rank = input.rank
  }
  if (input.body !== undefined) {
    if (!isTextWithinLimit(input.body)) return null
    patch.body = input.body
  }
  if (input.bodyJson !== undefined) {
    if (!isTextWithinLimit(input.bodyJson)) return null
    patch.bodyJson = input.bodyJson
  }

  const aliases = readStringArray(input.aliases)
  if (aliases === null) return null
  if (aliases !== undefined) patch.aliases = aliases
  const tags = readStringArray(input.tags)
  if (tags === null) return null
  if (tags !== undefined) patch.tags = tags

  if (input.worldviewFields !== undefined) {
    const wvf = readWorldviewFields(input.worldviewFields, undefined)
    if (wvf === null) return null
    if (wvf !== undefined) patch.worldviewFields = wvf
  }

  // 物品功法 / 势力 / 自定义字段：按并集初筛，生效子类由更新 handler 复核。
  const itemFields = readSubtypeFields(input.itemFields, allFieldKeys(ITEM_SUBTYPE_FIELDS))
  if (itemFields === null) return null
  if (itemFields !== undefined) patch.itemFields = itemFields

  const factionFields = readSubtypeFields(input.factionFields, allFieldKeys(FACTION_SUBTYPE_FIELDS))
  if (factionFields === null) return null
  if (factionFields !== undefined) patch.factionFields = factionFields

  const customFields = readCustomFields(input.customFields)
  if (customFields === null) return null
  if (customFields !== undefined) patch.customFields = customFields

  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * 统一设定库 IPC：通道前缀 `worldEntity:`。
 *
 * 主表：
 * - worldEntity:list              (bookId, type?, subtypeId?) → WorldEntityRow[]
 * - worldEntity:get               (id)                     → WorldEntityDetail | null
 * - worldEntity:create            (input)                  → WorldEntityDetail | null
 * - worldEntity:update            (id, patch)              → WorldEntityDetail | null
 * - worldEntity:delete            (id)                     → boolean（软删）
 * 附属：
 * - worldEntity:listAliases       (id)                     → WorldAliasRow[]
 * - worldEntity:setAliases        (id, aliases)            → boolean
 * - worldEntity:getText           (id)                     → WorldTextContent
 * - worldEntity:saveText          (id, body, bodyJson?)    → boolean
 * - worldEntity:listTags          (bookId)                 → WorldTagRow[]
 * - worldEntity:setTags           (id, names)              → string[] | null
 * 通用引用（第 7 批拆至 `ipc/worldRefs.ts`；关系类型取语义码字典）：
 * - worldEntity:listRefs          (id, semanticCode?)       → WorldRefRow[]（出边）
 * - worldEntity:listIncomingRefs  (id, semanticCode?)       → WorldRefRow[]（入边）
 * - worldEntity:listSemanticCodes ()                        → WorldSemanticCodeRow[]
 * - worldEntity:addRef            (input)                   → WorldRefRow | null
 * - worldEntity:updateRef         (id, patch)               → WorldRefRow | null
 * - worldEntity:removeRef         (id)                      → boolean
 * 境界体系（只读列表 + 写通道见 `worldPowers.ts`）：
 * - worldEntity:listPowerSystems  (bookId)                 → WorldPowerSystemRow[]
 */
export function registerWorldEntitiesIpc(): void {
  ipcMain.handle(
    'worldEntity:list',
    (_event, bookId: unknown, type: unknown, subtypeId: unknown) => {
      if (typeof bookId !== 'string') return []
      if (type !== undefined && !isEntityType(type)) return []
      if (subtypeId !== undefined && !isPositiveInt(subtypeId)) return []
      return listWorldEntities(bookId, type, subtypeId)
    }
  )

  ipcMain.handle('worldEntity:get', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return null
    return getWorldEntity(id)
  })

  ipcMain.handle('worldEntity:create', (_event, input: unknown) => {
    const parsed = parseCreateInput(input)
    if (!parsed) {
      log.warn('worldEntity:create 入参非法')
      return null
    }
    // 类别必填：世界观 / 角色 / 物品 / 势力必须由界面显式选择；境界体系不显示选择器，
    // 缺省时自动补默认预设分类（"境界体系"），任何类型都不接受 null。
    if (parsed.subtypeId === undefined || parsed.subtypeId === null) {
      const fallbackId = resolveDefaultSubtypeId(parsed.bookId, parsed.entityType)
      if (fallbackId !== null) parsed.subtypeId = fallbackId
    }
    // 子类校验：分类必须存在、未软删，且 book_id / entity_type 与实体一致（不满足返回 null）。
    const subtype = resolveEntitySubtype(parsed.bookId, parsed.entityType, parsed.subtypeId ?? null)
    if (!subtype) {
      log.warn('worldEntity:create 子类非法', {
        bookId: parsed.bookId,
        entityType: parsed.entityType,
        subtypeId: parsed.subtypeId
      })
      return null
    }
    if (!validateSubtypeFields(parsed.entityType, subtype, parsed)) {
      log.warn('worldEntity:create 子类字段非法', { bookId: parsed.bookId })
      return null
    }
    return runWrite('worldEntity:create', { bookId: parsed.bookId }, () =>
      createWorldEntity(parsed)
    )
  })

  ipcMain.handle('worldEntity:update', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = parseUpdatePatch(patch)
    if (!parsed) {
      log.warn('worldEntity:update 入参非法', { id })
      return null
    }
    // 子类字段需按「实体类型 + 生效子类（补丁新子类优先）」复核白名单：
    // 世界观六类 / 物品功法六类 / 势力六类 / 自定义（world_custom 动态键值）。
    const hasSubtypeFields =
      parsed.worldviewFields !== undefined ||
      parsed.itemFields !== undefined ||
      parsed.factionFields !== undefined ||
      parsed.customFields !== undefined
    const existing = getWorldEntity(id)
    if (!existing) {
      log.warn('worldEntity:update 入参非法', { id })
      return null
    }
    let effectiveSubtype: WorldEntitySubtypeRef = {
      subtypeId: existing.subtypeId,
      presetKey: existing.presetKey
    }
    if (parsed.subtypeId !== undefined) {
      // 显式传 null（清空类别）一律非法；指定分类时必须存在、未软删且归属本书 / 本类型。
      const resolved = resolveEntitySubtype(
        existing.bookId,
        existing.entityType,
        parsed.subtypeId
      )
      if (!resolved) {
        log.warn('worldEntity:update 子类非法', { id, subtypeId: parsed.subtypeId })
        return null
      }
      effectiveSubtype = resolved
    } else if (existing.subtypeId === null) {
      // 历史未分类数据：境界体系在任意更新时自动补默认预设分类；
      // 其他类型保持原样（历史数据仍可编辑，界面要求用户显式选择类别）。
      const fallbackId = resolveDefaultSubtypeId(existing.bookId, existing.entityType)
      const resolved =
        fallbackId === null
          ? null
          : resolveEntitySubtype(existing.bookId, existing.entityType, fallbackId)
      if (fallbackId !== null && resolved) {
        parsed.subtypeId = fallbackId
        effectiveSubtype = resolved
      }
    }
    if (
      hasSubtypeFields &&
      !validateSubtypeFields(existing.entityType, effectiveSubtype, parsed)
    ) {
      log.warn('worldEntity:update 子类字段非法', { id })
      return null
    }
    return runWrite('worldEntity:update', { id }, () => updateWorldEntity(id, parsed))
  })

  ipcMain.handle('worldEntity:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('worldEntity:delete', { id }, () => deleteWorldEntity(id))
  })

  ipcMain.handle('worldEntity:listAliases', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return []
    return listWorldAliases(id)
  })

  ipcMain.handle('worldEntity:setAliases', (_event, id: unknown, aliases: unknown) => {
    if (!isPositiveInt(id)) return false
    const parsed = readStringArray(aliases)
    if (parsed === undefined || parsed === null) return false
    return runWrite('worldEntity:setAliases', { id }, () => setWorldAliases(id, parsed))
  })

  ipcMain.handle('worldEntity:getText', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return { body: '', bodyJson: '' }
    return getWorldText(id)
  })

  ipcMain.handle(
    'worldEntity:saveText',
    (_event, id: unknown, body: unknown, bodyJson: unknown) => {
      if (!isPositiveInt(id) || !isTextWithinLimit(body)) return false
      if (bodyJson !== undefined && !isTextWithinLimit(bodyJson)) return false
      return runWrite('worldEntity:saveText', { id }, () =>
        saveWorldText(id, body, bodyJson ?? '')
      )
    }
  )

  ipcMain.handle('worldEntity:listTags', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string') return []
    return listWorldTags(bookId)
  })

  ipcMain.handle('worldEntity:setTags', (_event, id: unknown, names: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = readStringArray(names)
    if (parsed === undefined || parsed === null) return null
    return runWrite('worldEntity:setTags', { id }, () => setWorldTags(id, parsed))
  })

  ipcMain.handle('worldEntity:listPowerSystems', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string') return []
    return listPowerSystems(bookId)
  })

  // 通用引用通道（出 / 入边、语义码字典、增 / 改 / 删）独立成文件，避免本文件超过 500 行。
  registerWorldRefsIpc()
  // 境界体系写通道（体系信息）独立成文件，避免本文件超过 500 行。
  registerWorldPowersIpc()
}
