import { getDb } from './index'
import { CUSTOM_TABLE } from './schema/worldCustom'
import { FACTION_SUBTYPE_TABLES } from './schema/worldFactionSubtypes'
import { ITEM_SUBTYPE_TABLES } from './schema/worldItemSubtypes'
import { loadGradeRank, writeGradeRank } from './worldItemGradeRank'
import { FACTION_SUBTYPE_FIELDS, ITEM_SUBTYPE_FIELDS } from './worldEntityTypes'
import type {
  WorldCustomField,
  WorldCustomFieldInput,
  WorldEntitySubtypeRef
} from './worldEntityTypes'

/**
 * 统一设定库 · 子分类专属字段读写（批 L1：物品功法 / 势力 / 用户自定义类型；
 * 第 5 批：自定义子类改为键值行式）。
 *
 * 本文件从 `worldEntities.ts` 拆出（§3 单文件 ≤500 行），只负责**子分类表**：
 * - 预设子类：`world_weapon` / `world_sect` 等 12 张一对一子表（`schema/worldItemSubtypes.ts`
 *   / `schema/worldFactionSubtypes.ts`）；
 * - 非预设子类：通用表 `world_custom`（`schema/worldCustom.ts`），一条实体多行键值。
 *
 * 路由规则（第 4 批：`subtype_id` 为子类唯一真源）：
 * - `subtype.subtypeId === null`（未分类）→ 不读写任何子表；
 * - `presetKey` 非空且命中该类型预设 → 只读写对应子表，**不碰** `world_custom`；
 * - `presetKey` 为空（用户自定义子类）→ 只读写 `world_custom`，**不碰**任何预设子表。
 *
 * 预设判定使用 `world_subtypes.preset_key`（ASCII 稳定键），不再使用可改名的中文名称。
 * `kind` 列已废弃，本文件不读写。
 *
 * 第 3 批：物品品阶 `grade` / `rank` 不属于子类专属字段白名单，由
 * `worldItemGradeRank.ts` 单独读写物品 5 张预设子分类表；本文件保持纯子类字段职责。
 *
 * 子表行按需建 / 删（与世界观六类同口径）：预设子类在创建 / 子类变更 / 写入字段时
 * `INSERT OR IGNORE`，子类迁离或切成未分类时 `DELETE`。第 5 批起**自定义子类不预建空行**：
 * 只有写入字段时才产生键值行，字段被全部清空时行一并消失。字段写入按白名单 / 键值边界
 * 过滤，非法键静默丢弃（IPC 层已先拒）。
 */

/** 子分类专属字段入参（按数据层调用方提供的类型取用）。 */
export interface SubtypeFieldInputs {
  itemFields?: Record<string, string>
  factionFields?: Record<string, string>
  /** 自定义子类键值字段：整体替换（先删后插）。 */
  customFields?: readonly WorldCustomFieldInput[]
}

interface SubtypeTarget {
  table: string
  /** 预设子表列白名单；自定义子类为空数组（键值动态，无固定列）。 */
  allowed: readonly string[]
  /** true = `world_custom`（用户自定义类型）。 */
  custom: boolean
}

/** 解析子类目标表；未分类、非物品 / 势力、类型非法均返回 null。 */
function resolveTarget(entityType: string, subtype: WorldEntitySubtypeRef): SubtypeTarget | null {
  if (subtype.subtypeId === null) return null
  if (entityType !== 'item' && entityType !== 'faction') return null
  if (subtype.presetKey !== '') {
    const table =
      entityType === 'item'
        ? ITEM_SUBTYPE_TABLES[subtype.presetKey]
        : FACTION_SUBTYPE_TABLES[subtype.presetKey]
    const allowed =
      entityType === 'item'
        ? ITEM_SUBTYPE_FIELDS[subtype.presetKey]
        : FACTION_SUBTYPE_FIELDS[subtype.presetKey]
    return table && allowed ? { table, allowed, custom: false } : null
  }
  return { table: CUSTOM_TABLE, allowed: [], custom: true }
}

/** 是否为「用户自定义类型」：item / faction 且已分类、但未命中预设。 */
export function isCustomSubtype(entityType: string, subtype: WorldEntitySubtypeRef): boolean {
  return resolveTarget(entityType, subtype)?.custom === true
}

/** 读取某预设子类专属字段（未分类 / 无行时各字段回退空串）。 */
function loadSubtypeFields(
  entityType: string,
  subtype: WorldEntitySubtypeRef,
  entityId: number
): Record<string, string> {
  const target = resolveTarget(entityType, subtype)
  if (!target || target.custom) return {}
  const cols = target.allowed.join(', ')
  const row = getDb()
    .prepare(`SELECT ${cols} FROM ${target.table} WHERE entity_id = ?`)
    .get(entityId) as Record<string, string> | undefined
  const result: Record<string, string> = {}
  for (const field of target.allowed) {
    result[field] = row ? (row[field] ?? '') : ''
  }
  return result
}

/** 读取物品功法子类专属字段（非 item / 未分类 / 未命中预设返回空对象）。 */
export function loadItemFields(
  entityType: string,
  subtype: WorldEntitySubtypeRef,
  entityId: number
): Record<string, string> {
  if (entityType !== 'item') return {}
  const target = resolveTarget(entityType, subtype)
  if (!target || target.custom) return {}
  return loadSubtypeFields(entityType, subtype, entityId)
}

/** 读取势力子类专属字段（非 faction / 未分类 / 未命中预设返回空对象）。 */
export function loadFactionFields(
  entityType: string,
  subtype: WorldEntitySubtypeRef,
  entityId: number
): Record<string, string> {
  if (entityType !== 'faction') return {}
  const target = resolveTarget(entityType, subtype)
  if (!target || target.custom) return {}
  return loadSubtypeFields(entityType, subtype, entityId)
}

/**
 * 读取用户自定义类型自由字段（仅 item / faction 的自定义子类返回非空数组）。
 *
 * 第 5 批：`world_custom` 为键值行式，按 `sort_order, field_key` 稳定排序返回。
 */
export function loadCustomFields(
  entityType: string,
  subtype: WorldEntitySubtypeRef,
  entityId: number
): WorldCustomField[] {
  if (!isCustomSubtype(entityType, subtype)) return []
  return getDb()
    .prepare(
      `SELECT field_key AS key, field_value AS value, sort_order AS sortOrder
       FROM ${CUSTOM_TABLE}
       WHERE entity_id = ?
       ORDER BY sort_order, field_key`
    )
    .all(entityId) as WorldCustomField[]
}

/**
 * 确保子类行存在（仅预设子表；未分类 / 自定义子类不适用时无操作）。
 *
 * 自定义子类（`world_custom`）**不预建空行**：键值行只在写入字段时产生。
 */
export function ensureSubtypeRows(
  entityType: string,
  entityId: number,
  subtype: WorldEntitySubtypeRef
): void {
  const target = resolveTarget(entityType, subtype)
  if (!target || target.custom) return
  getDb().prepare(`INSERT OR IGNORE INTO ${target.table} (entity_id) VALUES (?)`).run(entityId)
}

/** 删除子类行（子类迁离 / 切成未分类时；不适用时无操作）。 */
export function deleteSubtypeRows(
  entityType: string,
  entityId: number,
  subtype: WorldEntitySubtypeRef
): void {
  const target = resolveTarget(entityType, subtype)
  if (!target) return
  getDb().prepare(`DELETE FROM ${target.table} WHERE entity_id = ?`).run(entityId)
}

/**
 * 整体替换自定义键值行（先删后插，事务包裹）。
 *
 * 第 5 批：`world_custom` 无固定列，写入语义为「提交的数组即全部字段」——
 * 空数组表示清空所有字段（行随 DELETE 消失）。`sortOrder` 缺省按数组下标补齐；
 * 空白键 / 重复键在此兜底跳过（IPC 已先拒），保证不写坏主键。
 */
function replaceCustomFields(entityId: number, fields: readonly WorldCustomFieldInput[]): void {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO ${CUSTOM_TABLE} (entity_id, field_key, field_value, sort_order)
     VALUES (?, ?, ?, ?)`
  )
  const seen = new Set<string>()
  db.transaction(() => {
    db.prepare(`DELETE FROM ${CUSTOM_TABLE} WHERE entity_id = ?`).run(entityId)
    fields.forEach((field, index) => {
      const key = field.key.trim()
      if (key === '' || seen.has(key) || typeof field.value !== 'string') return
      seen.add(key)
      insert.run(entityId, key, field.value, field.sortOrder ?? index)
    })
  })()
}

/**
 * 写入子类专属字段：预设子类按白名单过滤（仅字符串值）并确保行存在；
 * 自定义子类整体替换键值行（见 `replaceCustomFields`）。
 * 传入与当前子类不匹配的字段组（如预设子类却传 `customFields`）时被忽略。
 */
export function applySubtypeFields(
  entityType: string,
  entityId: number,
  subtype: WorldEntitySubtypeRef,
  inputs: SubtypeFieldInputs
): void {
  const target = resolveTarget(entityType, subtype)
  if (!target) return
  if (target.custom) {
    if (inputs.customFields !== undefined) replaceCustomFields(entityId, inputs.customFields)
    return
  }
  ensureSubtypeRows(entityType, entityId, subtype)

  const fields = entityType === 'item' ? inputs.itemFields : inputs.factionFields
  if (fields === undefined) return

  const entries = Object.entries(fields).filter(
    ([key, value]) => target.allowed.includes(key) && typeof value === 'string'
  )
  if (entries.length === 0) return
  const sets = entries.map(([key]) => `${key} = ?`).join(', ')
  const values = entries.map(([, value]) => value)
  getDb()
    .prepare(`UPDATE ${target.table} SET ${sets} WHERE entity_id = ?`)
    .run(...values, entityId)
}

/** 子类变更：删旧子类行、建新子类行（同一分类时只保证行存在）。 */
export function migrateSubtypeRows(
  entityType: string,
  entityId: number,
  oldSubtype: WorldEntitySubtypeRef,
  newSubtype: WorldEntitySubtypeRef
): void {
  if (oldSubtype.subtypeId === newSubtype.subtypeId) {
    ensureSubtypeRows(entityType, entityId, newSubtype)
    return
  }
  // 自定义子类之间互切：`world_custom` 行只按实体归属（不挂子类 id），
  // 故无需删建，键值字段原样保留。
  if (
    resolveTarget(entityType, oldSubtype)?.custom &&
    resolveTarget(entityType, newSubtype)?.custom
  ) {
    return
  }
  // 物品品阶随子类迁移一并带上（第 3 批起品阶在子分类表，删旧行会丢值）；
  // 新子类无品阶列（材料 / 自定义 / 未分类）时 `writeGradeRank` 静默忽略。
  const carried =
    entityType === 'item' ? loadGradeRank(entityType, oldSubtype.presetKey, entityId) : null
  deleteSubtypeRows(entityType, entityId, oldSubtype)
  ensureSubtypeRows(entityType, entityId, newSubtype)
  if (carried && (carried.grade !== '' || carried.rank !== 0)) {
    writeGradeRank(entityType, entityId, newSubtype.presetKey, carried)
  }
}
