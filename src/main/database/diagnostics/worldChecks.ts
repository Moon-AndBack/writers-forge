import type Database from 'better-sqlite3'
import { CUSTOM_TABLE } from '../schema/worldCustom'
import { FACTION_SUBTYPE_TABLES } from '../schema/worldFactionSubtypes'
import { ITEM_SUBTYPE_TABLES } from '../schema/worldItemSubtypes'
import { createIssue, formatItems } from './helpers'
import type { DiagnosticsIssue } from './types'

/**
 * **统一设定库 / 剧情关联**一致性检查（B 类应用层不变量的扩展，批F / 批G）。
 *
 * 覆盖：
 * - **孤儿子表**：`world_character` / `world_power_system` 中存在、主表
 *   `world_entities` 无对应行（FK 已开时 `PRAGMA foreign_key_check` 也会报，
 *   本检查给出按表聚合的可读清单）；
 * - **类型 / 子表错位**：`world_entities.entity_type` 与模块子表行的存在性不一致
 *   （应有子行而无、或不该有却有）——触发器保证正常写入路径不会产生，外力 / 老库可能残留；
 *   第 3 批起模块子表只剩 `world_character` / `world_power_system`（世界观 / 物品功法 /
 *   势力三类无模块表，不参与本项判定）；
 * - **关系自反**：`world_refs` 的 `from = to`（有 CHECK，老库或绕过写入仍可能残留）；
 * - **剧情场景关联悬空**：`plot_scene_world_entities` 引用了不存在的场景 / 实体。
 *
 * 第 6 批起专用关系表 / 明细表已下线：原针对专用关系表的自反检查随表删除，
 * 现只检查通用引用 `world_refs`；「天赋引用错型」检查随 `world_character_talents` 下线删除。
 *
 * 口径：只看结构问题，不判软删；表缺失时跳过相关检查（避免抛错中断，缺表已由结构检查报告）。
 */
export function checkWorldConsistency(
  db: Database.Database,
  tableNames: Set<string>
): DiagnosticsIssue[] {
  const issues: DiagnosticsIssue[] = []
  const has = (table: string): boolean => tableNames.has(table)

  if (has('world_entities')) {
    checkOrphanChildren(db, has, issues)
    checkChildMismatch(db, has, issues)
  }
  checkSelfRelations(db, has, issues)
  if (has('plot_scene_world_entities')) {
    checkPlotSceneLinks(db, has, issues)
  }

  return issues
}

/** 模块子表 → 对应的 `entity_type`（第 3 批起只剩两张；其余三类无模块表）。 */
const CHILD_TABLES: ReadonlyArray<{ table: string; type: string }> = [
  { table: 'world_character', type: 'character' },
  { table: 'world_power_system', type: 'power_system' }
]

/** 有向关系表：表名 + 两端列名（自反 = 两端相等）。第 6 批起仅剩通用引用表。 */
const SELF_RELATION_TABLES: ReadonlyArray<{ table: string; from: string; to: string }> = [
  { table: 'world_refs', from: 'from_id', to: 'to_id' }
]

/** 孤儿子表行（子表有行、主表无行）。 */
function checkOrphanChildren(
  db: Database.Database,
  has: (table: string) => boolean,
  issues: DiagnosticsIssue[]
): void {
  const items: string[] = []
  const childTables = CHILD_TABLES.map((entry) => entry.table)
  for (const table of childTables) {
    if (!has(table)) continue
    const rows = db
      .prepare(
        `SELECT c.rowid AS rowid FROM ${table} c
         WHERE NOT EXISTS (SELECT 1 FROM world_entities e WHERE e.id = c.entity_id)`
      )
      .all() as Array<{ rowid: number }>
    for (const row of rows) items.push(`${table}#${String(row.rowid)}`)
  }
  // 子类专属子表孤儿行检查：世界观六类（批 K1）+ 物品功法 / 势力各六类 +
  // 通用自定义表（批 L1，第 5 批起一实体多行键值，按 entity_id 同样适用）。
  const subtypeTables = [
    'world_overview',
    'world_geography',
    'world_culture',
    'world_race',
    'world_economy',
    'world_ruleset',
    ...Object.values(ITEM_SUBTYPE_TABLES),
    ...Object.values(FACTION_SUBTYPE_TABLES),
    CUSTOM_TABLE
  ]
  for (const table of subtypeTables) {
    if (!has(table)) continue
    const rows = db
      .prepare(
        `SELECT c.rowid AS rowid FROM ${table} c
         WHERE NOT EXISTS (SELECT 1 FROM world_entities e WHERE e.id = c.entity_id)`
      )
      .all() as Array<{ rowid: number }>
    for (const row of rows) items.push(`${table}#${String(row.rowid)}`)
  }
  // 角色天赋连接表已随第 6 批下线，不再有非 `entity_id` 引用列的孤儿子表。
  if (items.length > 0) {
    issues.push(createIssue('world.orphanChild', { items: formatItems(items), n: items.length }))
  }
}

/** `entity_type` 与五类子表存在性错位（两个方向）。 */
function checkChildMismatch(
  db: Database.Database,
  has: (table: string) => boolean,
  issues: DiagnosticsIssue[]
): void {
  const relevant = CHILD_TABLES.filter((entry) => has(entry.table))
  if (relevant.length === 0) return

  const joins = relevant
    .map((entry) => `LEFT JOIN ${entry.table} c_${entry.type} ON c_${entry.type}.entity_id = e.id`)
    .join('\n')
  const conditions: string[] = []
  for (const entry of relevant) {
    conditions.push(
      `(e.entity_type = '${entry.type}' AND c_${entry.type}.entity_id IS NULL)`,
      `(e.entity_type <> '${entry.type}' AND c_${entry.type}.entity_id IS NOT NULL)`
    )
  }
  const rows = db
    .prepare(
      `SELECT e.id AS id, e.entity_type AS entityType FROM world_entities e
       ${joins}
       WHERE ${conditions.join(' OR ')}`
    )
    .all() as Array<{ id: number; entityType: string }>
  if (rows.length > 0) {
    issues.push(
      createIssue('world.entityChildMismatch', {
        items: formatItems(rows.map((row) => `${row.id} (${row.entityType})`)),
        n: rows.length
      })
    )
  }
}

/** 有向关系两端相同（自反）。 */
function checkSelfRelations(
  db: Database.Database,
  has: (table: string) => boolean,
  issues: DiagnosticsIssue[]
): void {
  const items: string[] = []
  for (const relation of SELF_RELATION_TABLES) {
    if (!has(relation.table)) continue
    const rows = db
      .prepare(
        `SELECT rowid AS rowid FROM ${relation.table}
         WHERE ${relation.from} IS NOT NULL AND ${relation.from} = ${relation.to}`
      )
      .all() as Array<{ rowid: number }>
    for (const row of rows) items.push(`${relation.table}#${String(row.rowid)}`)
  }
  if (items.length > 0) {
    issues.push(createIssue('world.selfRelation', { items: formatItems(items), n: items.length }))
  }
}

/** 剧情场景 ↔ 实体连接行悬空（场景 / 实体任一端不存在）。 */
function checkPlotSceneLinks(
  db: Database.Database,
  has: (table: string) => boolean,
  issues: DiagnosticsIssue[]
): void {
  const sceneMissing = has('plot_scenes')
    ? `OR NOT EXISTS (SELECT 1 FROM plot_scenes s WHERE s.id = l.scene_id)`
    : ''
  const entityMissing = has('world_entities')
    ? `OR NOT EXISTS (SELECT 1 FROM world_entities e WHERE e.id = l.entity_id)`
    : ''
  // 两表都缺时无从判定（缺表已由结构检查报告），直接跳过。
  if (sceneMissing === '' && entityMissing === '') return

  const rows = db
    .prepare(
      `SELECT l.rowid AS rowid FROM plot_scene_world_entities l
       WHERE 0 = 1 ${sceneMissing} ${entityMissing}`
    )
    .all() as Array<{ rowid: number }>
  if (rows.length > 0) {
    issues.push(
      createIssue('plot.sceneEntityOrphan', {
        items: formatItems(rows.map((row) => `plot_scene_world_entities#${String(row.rowid)}`)),
        n: rows.length
      })
    )
  }
}
