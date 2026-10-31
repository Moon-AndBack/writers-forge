import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema · 物品功法六种子类专属子表（批 L1）。
 *
 * 背景：物品功法（`entity_type='item'`）的六种预设子类（武器 / 功法 / 丹药 / 天赋 / 装备 /
 * 材料）各有专属字段，沿用世界观批 K1 的**每类独立子表**范式（强类型列）；子类真源为
 * `world_entities.subtype_id` → `world_subtypes(preset_key)`（第 4 批）。未命中预设子类时
 * 改由 `world_custom` 承载自由字段，**不写**本文件任何子表。
 *
 * 结构：6 张一对一子表，主键 = `world_entities.id`，FK CASCADE 随主行物理删除；
 * 字段均为 TEXT NOT NULL DEFAULT ''。触发器不区分子类，专属子表由数据层按 `preset_key`
 * 手动 INSERT / UPDATE / DELETE（`worldEntitySubtypeFields.ts`）。
 *
 * 第 3 批：物品模块级 `grade` / `rank` 从 `world_item`（已删表）下沉到**前 5 张**预设子表
 * （武器 / 功法 / 丹药 / 天赋 / 装备）：
 * - `grade TEXT NOT NULL DEFAULT ''`：等级显示标签（域内自定义，如「上品」「S」）；
 * - `rank INTEGER NOT NULL DEFAULT 0`：0 起可比较档位（0 = 未定级），仅排序 / 比较用。
 * `world_material` 已有 `grade_label`，语义重叠，**不**再加 `grade` / `rank`。
 * 老库由 `database/worldItemGradeRankDown.ts` 一次性「补列 → 迁移 → 删 world_item」。
 */

/**
 * 物品功法子类的 **`preset_key`** → 专属子表名（数据层 / 自检共用）。
 *
 * 第 4 批起键为 `world_subtypes.preset_key`（ASCII 稳定键），不再使用中文名称。
 */
export const ITEM_SUBTYPE_TABLES: Readonly<Record<string, string>> = {
  weapon: 'world_weapon',
  skill: 'world_skill',
  pill: 'world_pill',
  talent: 'world_talent',
  equipment: 'world_equipment',
  material: 'world_material'
}

/**
 * 携带品阶列（`grade` / `rank`）的物品预设子类（`preset_key`）→ 子表。
 *
 * 第 3 批起品阶从模块表 `world_item` 下沉到此 5 张表；`材料`（`material`）用自身的
 * `grade_label` 表达品级，语义重复，故不在其中。
 */
export const ITEM_GRADE_RANK_TABLES: Readonly<Record<string, string>> = {
  weapon: 'world_weapon',
  skill: 'world_skill',
  pill: 'world_pill',
  talent: 'world_talent',
  equipment: 'world_equipment'
}

export function createWorldItemSubtypesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_weapon (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      attack TEXT NOT NULL DEFAULT '',
      durability TEXT NOT NULL DEFAULT '',
      weight TEXT NOT NULL DEFAULT '',
      material TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_skill (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      tier TEXT NOT NULL DEFAULT '',
      practice TEXT NOT NULL DEFAULT '',
      cost TEXT NOT NULL DEFAULT '',
      requirement TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_pill (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      effect TEXT NOT NULL DEFAULT '',
      side_effect TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '',
      shelf_life TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_talent (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      talent_type TEXT NOT NULL DEFAULT '',
      awaken_condition TEXT NOT NULL DEFAULT '',
      growth TEXT NOT NULL DEFAULT '',
      limitation TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_equipment (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      defense TEXT NOT NULL DEFAULT '',
      slot TEXT NOT NULL DEFAULT '',
      set_bonus TEXT NOT NULL DEFAULT '',
      durability TEXT NOT NULL DEFAULT '',
      grade TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_material (
      entity_id INTEGER PRIMARY KEY REFERENCES world_entities(id) ON DELETE CASCADE,
      usage TEXT NOT NULL DEFAULT '',
      grade_label TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      reserve TEXT NOT NULL DEFAULT ''
    )
  `)

  // 7. 幂等补列：老库 5 张物品子表补 `grade` / `rank`（纯增量 `ADD COLUMN`，保留既有行）。
  //    须在 `database/worldItemGradeRankDown.ts` 迁移之前完成（同一次启动内先补列、再迁移、
  //    最后删 `world_item`）；新库首启时列已由上方 DDL 建好，此处直接跳过。
  for (const table of Object.values(ITEM_GRADE_RANK_TABLES)) {
    const columns = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
        (column) => column.name
      )
    )
    if (!columns.has('grade')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN grade TEXT NOT NULL DEFAULT ''`)
    }
    if (!columns.has('rank')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN rank INTEGER NOT NULL DEFAULT 0`)
    }
  }
}
