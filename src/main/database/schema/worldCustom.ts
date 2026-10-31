import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema · 用户自定义类型通用表（批 L1，第 5 批改为键值行式）。
 *
 * 背景：子类真源为 `world_entities.subtype_id` → `world_subtypes`。命中预设子类
 * （`preset_key` 非空）的实体写入对应子分类表；未命中预设（用户自定义子类，
 * `preset_key = ''`）时字段无处安放，故以**单张通用表** `world_custom` 承载自由字段，
 * 避免为每个自定义类型建表。
 *
 * 规则（数据层 `worldEntitySubtypeFields.ts` 落实）：
 * - 仅 `entity_type IN ('item','faction')` 且已分类但 `preset_key = ''` 时写入本表；
 * - 命中预设子类 / 未分类时**不得**写本表（子类真源唯一，避免双写歧义）；
 * - 第 5 批起为**键值行式**：一条自定义实体可有多行，`field_key` 是用户可读的字段名
 *   （去首尾空白后 1–64 字符），`field_value` 为文本值（≤2000 字符），`sort_order`
 *   为展示序；每个实体最多 64 行（主进程校验）。不再有固定 4 列 / 固定白名单。
 *
 * 结构：一对多，主键 = (`entity_id`, `field_key`)，FK CASCADE 随主行物理删除。
 * 未分类 / 预设子类不预建空行：只有写入字段时才产生行。
 */

/** 通用自定义表名（数据层 / 迁移 / 自检共用）。 */
export const CUSTOM_TABLE = 'world_custom'

export function createWorldCustomSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_custom (
      entity_id INTEGER NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
      field_key TEXT NOT NULL,
      field_value TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity_id, field_key)
    )
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_world_custom_entity ON world_custom(entity_id)
  `)
}
