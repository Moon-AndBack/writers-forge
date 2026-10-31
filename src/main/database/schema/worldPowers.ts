import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema（第 4 层）：**境界体系**（1 表，无命名索引）。
 *
 * 定位：`entity_type = 'power_system'` 的唯一预设子分类表 / 模块子表。
 * 第 6 批起境界体系只保留「体系」一张表，原渠道 / 层级 / 晋升边 / 角色境界
 * （`world_power_paths` / `world_power_tiers` / `world_power_transitions` /
 * `world_character_powers`）已下线；层级化结构改由「体系说明」自由文本表达。
 *
 * 结构：
 * - `world_power_system`（一对一）：主键 = `world_entities.id`，仅含 `kind`
 *   （fixed / sequence / path …，**自由文本**）。
 *
 * 已下线（简介列）：本表的 `summary` 与主表 `world_entities.summary` ——
 * 五域统一删除简介列，历史数据直接丢弃（简介后续走正文）。老库由
 * `database/worldEntitiesDropSummary.ts` 一次性删列收敛
 * （守卫键 `worldEntities:dropSummary:v1`）。
 *
 * 设计取舍：
 * - `kind` 为自由文本，不设枚举 CHECK，便于各作品自定义体系类型。
 * - 全部 `CREATE ... IF NOT EXISTS` 幂等；被删表由
 *   `database/worldTablesDropDown.ts` 一次性 DROP 收敛老库。
 */
export function createWorldPowersSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_power_system (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT ''
    )
  `)
}
