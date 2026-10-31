import { getDb } from './index'
import { listEntityTags, listWorldAliases } from './worldEntityMeta'
import type {
  WorldEntityDetail,
  WorldEntityRelationSummary,
  WorldEntityRow,
  WorldEntitySubtypeRef,
  WorldEntityType
} from './worldEntityTypes'
import { WORLD_ENTITY_TYPES, WORLDVIEW_SUBTYPE_FIELDS } from './worldEntityTypes'
import { loadCustomFields, loadFactionFields, loadItemFields } from './worldEntitySubtypeFields'
import { loadGradeRank, loadGradeRankMap } from './worldItemGradeRank'
import type { ItemGradeRank } from './worldItemGradeRank'
import { loadRelationSummaryMap } from './worldRefs'
import { WV_SUBTYPE_TABLE } from './worldEntityShared'

/**
 * 统一设定库 · 主表只读路径（列表 / 详情）。
 *
 * 由 `worldEntities.ts` 再导出；结构真源见 `schema/worldEntities.ts`。
 * 约定：读路径默认过滤 `deleted_at IS NULL`；子类名 / 路由键由 `world_subtypes` JOIN 提供。
 */

/** 主表读列清单（子类名 / 路由键由 `world_subtypes` JOIN 提供；正文由 `world_texts` JOIN 提供）。 */
const SELECT_COLUMNS = `e.id, e.uuid, e.book_id AS bookId, e.entity_type AS entityType,
  COALESCE(st.name, '') AS subType, e.subtype_id AS subtypeId,
  COALESCE(st.preset_key, '') AS presetKey, e.name, COALESCE(t.body, '') AS body,
  e.revision, e.created_at AS createdAt, e.updated_at AS updatedAt, e.deleted_at AS deletedAt`

/**
 * 主表读 FROM（与 {@link SELECT_COLUMNS} 配套）。
 *
 * 子类 JOIN 必须带 `st.deleted_at IS NULL`：历史脏数据里 `subtype_id` 可能仍指向已软删
 * 子类，过滤后此类实体回显为空分类（未分类），而不是显示已删分类名。必须是 LEFT JOIN，
 * 否则未分类实体（`subtype_id IS NULL`）会被整行丢弃。
 */
const SELECT_FROM =
  'FROM world_entities e LEFT JOIN world_subtypes st ON st.id = e.subtype_id AND st.deleted_at IS NULL LEFT JOIN world_texts t ON t.entity_id = e.id'

interface WorldEntityDbRow {
  id: number
  uuid: string
  bookId: string
  entityType: string
  subType: string
  subtypeId: number | null
  presetKey: string
  name: string
  body: string
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 数据库行 → 领域行（枚举非法值回退默认，避免脏数据击穿类型）。 */
function toEntityRow(
  row: WorldEntityDbRow,
  gradeRank?: ItemGradeRank,
  aliases: string[] = [],
  relations: WorldEntityRelationSummary[] = []
): WorldEntityRow {
  return {
    id: row.id,
    uuid: row.uuid,
    bookId: row.bookId,
    entityType: WORLD_ENTITY_TYPES.includes(row.entityType as WorldEntityType)
      ? (row.entityType as WorldEntityType)
      : 'worldview',
    subType: row.subType,
    subtypeId: row.subtypeId,
    presetKey: row.presetKey,
    name: row.name,
    body: row.body,
    aliases,
    relations,
    // 物品品阶由子分类表读出（第 3 批起 `world_item` 已下线），其余实体为空串 + 0。
    grade: gradeRank?.grade ?? '',
    rank: gradeRank?.rank ?? 0,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt
  }
}

/**
 * 批量取别名（entity_id → alias[]，按 sort_order, id 排序）。
 *
 * 列表路径一次 IN 查询补齐全页，避免 N+1；不用 GROUP_CONCAT：别名可含逗号 /
 * 引号，聚合需转义解析，且排序保证弱于 ORDER BY 直查。
 */
function loadAliasMap(ids: readonly number[]): Map<number, string[]> {
  const result = new Map<number, string[]>()
  if (ids.length === 0) return result
  const placeholders = ids.map(() => '?').join(', ')
  const rows = getDb()
    .prepare(
      `SELECT entity_id AS entityId, alias FROM world_aliases
       WHERE entity_id IN (${placeholders}) ORDER BY sort_order, id`
    )
    .all(...ids) as Array<{ entityId: number; alias: string }>
  for (const row of rows) {
    const list = result.get(row.entityId)
    if (list) list.push(row.alias)
    else result.set(row.entityId, [row.alias])
  }
  for (const id of ids) {
    if (!result.has(id)) result.set(id, [])
  }
  return result
}

/**
 * 列出某书实体；可选按类型 / 子类分类 id 过滤（`subtypeId` 精确匹配）。
 * 排序：类型 → id，保证同类型内创建序稳定。
 *
 * 物品品阶（`grade` / `rank`）不在主表：命中 5 个预设子类时按 `presetKey` 批量从对应
 * 子分类表补齐（一次每子表一条查询），其余实体为空串 + 0。
 * 关系摘要（`relations`）由 `worldRefs.ts` 的 `loadRelationSummaryMap` 批量补齐
 * （出边 + 入边，出边在前）。
 */
export function listWorldEntities(
  bookId: string,
  entityType?: WorldEntityType,
  subtypeId?: number
): WorldEntityRow[] {
  const where = ['e.book_id = @bookId', 'e.deleted_at IS NULL']
  const params: Record<string, unknown> = { bookId }
  if (entityType !== undefined) {
    where.push('e.entity_type = @entityType')
    params.entityType = entityType
  }
  if (subtypeId !== undefined) {
    where.push('e.subtype_id = @subtypeId')
    params.subtypeId = subtypeId
  }
  const rows = getDb()
    .prepare(
      `SELECT ${SELECT_COLUMNS} ${SELECT_FROM}
       WHERE ${where.join(' AND ')} ORDER BY e.entity_type, e.id`
    )
    .all(params) as WorldEntityDbRow[]
  const gradeRanks = loadGradeRankMap(
    rows.map((row) => ({ id: row.id, entityType: row.entityType, presetKey: row.presetKey }))
  )
  const aliasMap = loadAliasMap(rows.map((row) => row.id))
  const relationMap = loadRelationSummaryMap(rows.map((row) => row.id))
  return rows.map((row) =>
    toEntityRow(
      row,
      gradeRanks.get(row.id),
      aliasMap.get(row.id) ?? [],
      relationMap.get(row.id) ?? []
    )
  )
}

/** 读取世界观六种预设子类的专属字段（未分类 / 非六类 / 非 worldview 返回空对象）。 */
function loadWorldviewFields(
  entityType: string,
  presetKey: string,
  id: number
): Record<string, string> {
  if (entityType !== 'worldview') return {}
  const table = WV_SUBTYPE_TABLE[presetKey]
  if (!table) return {}
  const fields = WORLDVIEW_SUBTYPE_FIELDS[presetKey]
  if (!fields) return {}
  const cols = fields.join(', ')
  const row = getDb().prepare(`SELECT ${cols} FROM ${table} WHERE entity_id = ?`).get(id) as
    | Record<string, string>
    | undefined
  const result: Record<string, string> = {}
  for (const field of fields) {
    result[field] = row ? (row[field] ?? '') : ''
  }
  return result
}

/** 读取实体详情（含子表字段 / 别名 / 标签 / 正文）；不存在或已软删返回 null。 */
export function getWorldEntity(id: number): WorldEntityDetail | null {
  const row = getDb()
    .prepare(
      `SELECT ${SELECT_COLUMNS},
              COALESCE(c.role, '') AS role,
              COALESCE(t.body_json, '') AS bodyJson,
              COALESCE(ps.kind, '') AS powerKind
       ${SELECT_FROM}
       LEFT JOIN world_character c ON c.entity_id = e.id
       LEFT JOIN world_power_system ps ON ps.entity_id = e.id
       WHERE e.id = ? AND e.deleted_at IS NULL`
    )
    .get(id) as (WorldEntityDbRow & { role: string; bodyJson: string; powerKind: string }) | undefined
  if (!row) return null
  const subtype: WorldEntitySubtypeRef = { subtypeId: row.subtypeId, presetKey: row.presetKey }
  const aliases = listWorldAliases(id).map((alias) => alias.alias)
  return {
    ...toEntityRow(
      row,
      loadGradeRank(row.entityType, row.presetKey, id),
      aliases,
      // 详情也填充关系摘要：悬停卡需要「关联关系」行，且摘要自带对端模块 / 预设键，
      // 可直接用于关系胶囊着色（与列表路径同一结构，避免渲染层再按 peerId 回查）。
      loadRelationSummaryMap([id]).get(id) ?? []
    ),
    role: row.role,
    // 详情独占：富文本正文 JSON（列表不返回，避免传输膨胀）。
    bodyJson: row.bodyJson,
    // 批 L1：`kind` 已废弃，恒返回空串（子类真源为 `subtypeId`），仅保留字段避免类型破坏。
    kind: '',
    // 境界体系类型（`world_power_system.kind`）：其余实体恒为空串。
    powerKind: row.powerKind,
    worldviewFields: loadWorldviewFields(row.entityType, row.presetKey, id),
    itemFields: loadItemFields(row.entityType, subtype, id),
    factionFields: loadFactionFields(row.entityType, subtype, id),
    customFields: loadCustomFields(row.entityType, subtype, id),
    aliases,
    tags: listEntityTags(id)
  }
}
