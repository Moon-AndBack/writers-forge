import {
  CUSTOM_FIELD_LIMITS,
  FACTION_SUBTYPE_FIELDS,
  ITEM_SUBTYPE_FIELDS,
  WORLDVIEW_SUBTYPE_FIELDS
} from '../database/worldEntities'
import type {
  WorldCustomFieldInput,
  WorldEntitySubtypeRef,
  WorldEntityType
} from '../database/worldEntities'
import { isCustomSubtype } from '../database/worldEntitySubtypeFields'

/**
 * 统一设定库 IPC · **子类专属字段入参解析与校验**（批 L1 / 第 4 批 / 第 5 批）。
 *
 * 从 `worldEntities.ts` 拆出（§3 单文件 ≤500 行）：世界观六类 / 物品功法六类 / 势力六类 /
 * 用户自定义（`world_custom` 键值行）的字段校验集中于此，主通道文件只负责组装补丁。
 *
 * 第 4 批：白名单键为 `world_subtypes.preset_key`（不再是中文子类名）。子类入参只有
 * `subtypeId`，`preset_key` 由 IPC 经 `resolveEntitySubtype` 解析后传入。
 *
 * 第 5 批：自定义子类不再有固定 4 键白名单，改为**动态键值数组**，边界约束见
 * `CUSTOM_FIELD_LIMITS`（最多 64 条、字段名 1–64 字符、字段值 ≤2000 字符）。
 * **重复字段名一律拒绝**（不做后写覆盖），避免静默丢值。
 *
 * 两层校验：
 * 1. **解析期**（本文件 `read*Fields`）：值必须是字符串、键必须落在候选白名单内（预设子类）；
 *    更新补丁未带 `subtypeId` 时用「该类型全部预设子类的字段并集」初筛；
 * 2. **生效期**（`validateSubtypeFields`）：以「实体类型 + 生效子类」复核，
 *    自定义子类接受键值数组但须满足边界约束，未分类不接受任何子类专属字段。
 */

/** 判断是否为普通对象（用于校验 IPC 入参）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 解析世界观专属字段：未提供 → undefined；非法 → null。 */
export function readWorldviewFields(
  value: unknown,
  presetKey: string | undefined
): Record<string, string> | null | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null
  for (const v of Object.values(value)) {
    if (typeof v !== 'string') return null
  }
  if (presetKey !== undefined) {
    const allowed = WORLDVIEW_SUBTYPE_FIELDS[presetKey]
    if (!allowed) return null
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) return null
    }
  } else {
    const allKeys = new Set(Object.values(WORLDVIEW_SUBTYPE_FIELDS).flat())
    for (const key of Object.keys(value)) {
      if (!allKeys.has(key)) return null
    }
  }
  return value as Record<string, string>
}

/** 某子类映射的全部字段键（更新补丁未带 `subtypeId` 时先做并集初筛）。 */
export function allFieldKeys(mapping: Readonly<Record<string, readonly string[]>>): string[] {
  return Object.values(mapping).flat()
}

/**
 * 解析子类专属字段记录：未提供 → undefined；非对象 / 非字符串值 / 含白名单外键 → null。
 * 仅用于**预设子类**白名单场景；自定义子类走 {@link readCustomFields}。
 */
export function readSubtypeFields(
  value: unknown,
  allowedKeys: readonly string[]
): Record<string, string> | null | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return null
  for (const v of Object.values(value)) {
    if (typeof v !== 'string') return null
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) return null
  }
  return value as Record<string, string>
}

/** 非负整数判定（`sortOrder` 用）。 */
function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * 解析用户自定义子类的键值字段数组（第 5 批）：未提供 → undefined；非法 → null。
 *
 * 边界（`CUSTOM_FIELD_LIMITS`）：
 * - 必须是数组，最多 64 项；
 * - 每项为 `{ key: string, value: string, sortOrder?: 非负整数 }`；
 * - 字段名去首尾空白后 1–64 字符（返回值为**已去空白**的键）；
 * - 字段值字符串长度 ≤2000（不裁剪，保留用户输入）；
 * - **重复字段名拒绝**（返回 null），不做后写覆盖。
 */
export function readCustomFields(value: unknown): WorldCustomFieldInput[] | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > CUSTOM_FIELD_LIMITS.maxEntries) return null

  const seen = new Set<string>()
  const result: WorldCustomFieldInput[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const { key, value: fieldValue, sortOrder } = item
    if (typeof key !== 'string' || typeof fieldValue !== 'string') return null
    const trimmedKey = key.trim()
    if (trimmedKey === '' || trimmedKey.length > CUSTOM_FIELD_LIMITS.keyMaxLength) return null
    if (fieldValue.length > CUSTOM_FIELD_LIMITS.valueMaxLength) return null
    if (sortOrder !== undefined && !isNonNegativeInt(sortOrder)) return null
    if (seen.has(trimmedKey)) return null
    seen.add(trimmedKey)
    result.push(
      sortOrder === undefined
        ? { key: trimmedKey, value: fieldValue }
        : { key: trimmedKey, value: fieldValue, sortOrder }
    )
  }
  return result
}

/** 子类字段补丁（创建 / 更新共用）。 */
export interface SubtypeFieldPatch {
  worldviewFields?: Record<string, string>
  itemFields?: Record<string, string>
  factionFields?: Record<string, string>
  /** 自定义子类键值字段（动态键，边界见 `CUSTOM_FIELD_LIMITS`）。 */
  customFields?: WorldCustomFieldInput[]
}

/**
 * 校验子类专属字段与「实体类型 + 生效子类」匹配（批 L1 / 第 4 批 / 第 5 批）。
 * - 未分类（`subtypeId = null`）：不接受任何子类专属字段；
 * - 预设子类：字段键必须属于该 `preset_key` 的白名单；
 * - 自定义子类：接受键值数组，但须满足 `readCustomFields` 的边界约束，
 *   且实体必须是 item / faction。
 */
export function validateSubtypeFields(
  entityType: WorldEntityType,
  subtype: WorldEntitySubtypeRef,
  fields: SubtypeFieldPatch
): boolean {
  const keysAllowed = (
    record: Record<string, string> | undefined,
    allowed: readonly string[]
  ): boolean => record === undefined || Object.keys(record).every((key) => allowed.includes(key))

  if (
    subtype.subtypeId === null &&
    (fields.worldviewFields !== undefined ||
      fields.itemFields !== undefined ||
      fields.factionFields !== undefined ||
      fields.customFields !== undefined)
  ) {
    return false
  }

  if (fields.worldviewFields !== undefined) {
    if (entityType !== 'worldview') return false
    const allowed = WORLDVIEW_SUBTYPE_FIELDS[subtype.presetKey]
    if (!allowed || !keysAllowed(fields.worldviewFields, allowed)) return false
  }
  if (fields.itemFields !== undefined) {
    if (entityType !== 'item') return false
    const allowed = ITEM_SUBTYPE_FIELDS[subtype.presetKey]
    if (!allowed || !keysAllowed(fields.itemFields, allowed)) return false
  }
  if (fields.factionFields !== undefined) {
    if (entityType !== 'faction') return false
    const allowed = FACTION_SUBTYPE_FIELDS[subtype.presetKey]
    if (!allowed || !keysAllowed(fields.factionFields, allowed)) return false
  }
  if (fields.customFields !== undefined) {
    if (!isCustomSubtype(entityType, subtype)) return false
    if (readCustomFields(fields.customFields) === null) return false
  }
  return true
}
