import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema · 势力六种子类专属子表（批 L1）。
 *
 * 背景：势力（`entity_type='faction'`）的六种预设子类（宗门 / 家族 / 王朝 / 商会 /
 * 散修联盟 / 魔教）各有专属字段，沿用世界观批 K1 的**每类独立子表**范式（强类型列）；
 * 子类真源为 `world_entities.subtype_id` → `world_subtypes(preset_key)`（第 4 批）。
 * 未命中预设子类时改由 `world_custom` 承载自由字段，**不写**本文件任何子表。
 *
 * 结构：6 张一对一子表，主键 = `world_entities.id`，FK CASCADE 随主行物理删除；
 * 字段均为 TEXT NOT NULL DEFAULT ''。触发器不区分子类，专属子表由数据层按 `preset_key`
 * 手动 INSERT / UPDATE / DELETE（`worldEntitySubtypeFields.ts`）。
 */

/** 势力子类的 **`preset_key`** → 专属子表名（数据层 / 自检共用）。 */
export const FACTION_SUBTYPE_TABLES: Readonly<Record<string, string>> = {
  sect: 'world_sect',
  family: 'world_family',
  dynasty: 'world_dynasty',
  guild: 'world_guild',
  alliance: 'world_alliance',
  demonic: 'world_demonic'
}

export function createWorldFactionSubtypesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_sect (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      gate TEXT NOT NULL DEFAULT '',
      disciples TEXT NOT NULL DEFAULT '',
      heritage TEXT NOT NULL DEFAULT '',
      precepts TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_family (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      patriarch TEXT NOT NULL DEFAULT '',
      family_rules TEXT NOT NULL DEFAULT '',
      bloodline TEXT NOT NULL DEFAULT '',
      ancestral_teaching TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_dynasty (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      territory TEXT NOT NULL DEFAULT '',
      law TEXT NOT NULL DEFAULT '',
      army TEXT NOT NULL DEFAULT '',
      capital TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_guild (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      business TEXT NOT NULL DEFAULT '',
      funds TEXT NOT NULL DEFAULT '',
      branches TEXT NOT NULL DEFAULT '',
      reputation TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_alliance (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      form TEXT NOT NULL DEFAULT '',
      members TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      freedom TEXT NOT NULL DEFAULT ''
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_demonic (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      doctrine TEXT NOT NULL DEFAULT '',
      ritual TEXT NOT NULL DEFAULT '',
      taboo TEXT NOT NULL DEFAULT '',
      sphere TEXT NOT NULL DEFAULT ''
    )
  `)
}
