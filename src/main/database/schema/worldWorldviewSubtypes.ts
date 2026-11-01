import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema · 世界观六种子类专属子表（批 K1）。
 *
 * 背景：世界观（`entity_type='worldview'`）的六种预设子类（世界概况 / 地理环境 / 文化背景 /
 * 种族生物 / 经济体系 / 世界规则）各有专属字段，采用**每类独立子表**（强类型列）；
 * 用户自定义子类仅保留主表通用字段（`world_worldview` 空壳表已于第 3 批下线）。
 * 第 4 批起路由键为 `world_subtypes.preset_key`（overview / geography / culture /
 * race / economy / ruleset）。
 *
 * 结构：6 张一对一子表，主键 = `world_entities.id`，FK CASCADE 随主行物理删除；
 * 字段均为 TEXT NOT NULL DEFAULT ''。触发器不区分子类，专属子表由数据层按 `preset_key`
 * 手动 INSERT / UPDATE / DELETE（`worldEntities.ts`）。
 *
 * 命名：第 6 批前存在明细表 `world_rules`（entity_id + text + sort_order），故世界规则
 * 专属子表命名为 `world_ruleset` 避免冲突；`world_rules` 已随第 6 批下线，此命名保持不变。
 */
export function createWorldviewSubtypesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_overview (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      era TEXT NOT NULL DEFAULT '',
      scale TEXT NOT NULL DEFAULT '',
      population TEXT NOT NULL DEFAULT '',
      epoch TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_geography (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      coordinates TEXT NOT NULL DEFAULT '',
      climate TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      terrain TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_culture (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      language TEXT NOT NULL DEFAULT '',
      customs TEXT NOT NULL DEFAULT '',
      religion TEXT NOT NULL DEFAULT '',
      art TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_race (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      lifespan TEXT NOT NULL DEFAULT '',
      body_size TEXT NOT NULL DEFAULT '',
      reproduction TEXT NOT NULL DEFAULT '',
      habits TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_economy (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT '',
      tax_rate TEXT NOT NULL DEFAULT '',
      trade_routes TEXT NOT NULL DEFAULT '',
      resources TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_ruleset (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      physics TEXT NOT NULL DEFAULT '',
      magic TEXT NOT NULL DEFAULT '',
      taboo TEXT NOT NULL DEFAULT '',
      boundary TEXT NOT NULL DEFAULT ''
    )
  `)
}
