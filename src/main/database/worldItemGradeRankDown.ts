import type Database from 'better-sqlite3'
import { CUSTOM_TABLE } from './schema/worldCustom'

/**
 * 一次性迁移（第 3 批）：物品品阶下沉 + 三张模块子表下线。
 *
 * 背景：`world_worldview`（删掉废弃字段后只剩 `entity_id`）与 `world_faction` 是空壳表；
 * `world_item` 的 `kind` 已废弃（批 L1），`grade` / `rank` 本批下沉到物品 5 张预设子分类表
 * （`world_weapon` / `world_skill` / `world_pill` / `world_talent` / `world_equipment`）。
 * 三张表从此不再参与读写，继续保留只会让「主表结构 = 设计清单」失真。
 *
 * 同一次启动内的执行顺序（`database/index.ts` 保证）：
 * 1. `createWorldItemSubtypesSchema` 先幂等补齐 5 张子表的 `grade` / `rank` 列；
 * 2. 本迁移按 `sub_type` 把 `world_item.grade` / `rank` 复制到对应子分类表同名行
 *    （目标行不存在时先 `INSERT OR IGNORE` 建行）；
 * 3. 复制完成后 `DROP TABLE` 三张模块子表。
 *
 * 兼容旧库（守卫键尚未写入时的老数据）：
 * - `world_item.kind` / `world_faction.kind` → `world_entities.sub_type` 回填（仅 `sub_type`
 *   为空、`kind` 非空的行），并把回填后的子类行补齐到预设子表 / `world_custom`；
 *   表或列不存在时整段跳过（新库 / 已迁移库）。
 *
 * 幂等 / 事务：settings 键 `worldItem:gradeRankDown:v1` 守卫（只执行一次）；整体事务包裹，
 * 任一步失败即回滚且不置键，下次启动自动重试。表名 / 子类名均取自固定常量（非用户输入），
 * 拼接安全。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，须在 `createWorldItemSubtypesSchema`
 * （目标表与列已就绪）之后、种子之前。
 */

/** 一次性迁移守卫键。 */
const GRADE_RANK_DOWN_KEY = 'worldItem:gradeRankDown:v1'

/** 本批下线的三张模块子表（均只引用 `world_entities`，无相互外键，删除顺序无关）。 */
const LEGACY_MODULE_TABLES: readonly string[] = ['world_worldview', 'world_faction', 'world_item']

/**
 * 历史快照（第 3 批口径）：子类**名称** → 子表名。
 *
 * 第 4 批起数据层已改用 `world_subtypes.preset_key`（ASCII 键），但本迁移只服务
 * 「守卫键尚未写入」的老库 —— 那时 `world_entities.sub_type` 存的仍是名称，故此处
 * 保留名称映射，**不**复用 `schema/*` 的 preset_key 映射（改名会改变本迁移语义）。
 */
const LEGACY_ITEM_SUBTYPE_TABLES: Readonly<Record<string, string>> = {
  武器: 'world_weapon',
  功法: 'world_skill',
  丹药: 'world_pill',
  天赋: 'world_talent',
  装备: 'world_equipment',
  材料: 'world_material'
}

/** 历史快照（第 3 批口径）：势力子类名称 → 子表名。 */
const LEGACY_FACTION_SUBTYPE_TABLES: Readonly<Record<string, string>> = {
  宗门: 'world_sect',
  家族: 'world_family',
  王朝: 'world_dynasty',
  商会: 'world_guild',
  散修联盟: 'world_alliance',
  魔教: 'world_demonic'
}

/** 历史快照：带 `grade` / `rank` 的物品预设子类名称 → 子表名（材料不在其中）。 */
const LEGACY_ITEM_GRADE_RANK_TABLES: Readonly<Record<string, string>> = {
  武器: 'world_weapon',
  功法: 'world_skill',
  丹药: 'world_pill',
  天赋: 'world_talent',
  装备: 'world_equipment'
}

/** 曾带 `kind` 列的模块表 → 实体类型（仅老库回填用）。 */
const KIND_TABLES: ReadonlyArray<{ table: string; entityType: string }> = [
  { table: 'world_item', entityType: 'item' },
  { table: 'world_faction', entityType: 'faction' }
]

/** 表是否存在（老库 / 新库兼容探测）。 */
function hasTable(instance: Database.Database, table: string): boolean {
  const row = instance
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  return Boolean(row)
}

/** 实测某表列名集合（表不存在时返回空集）。 */
function readColumnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/** 回填单个模块表的 `kind` → `sub_type`（仅 `sub_type` 为空、`kind` 非空的行）。 */
function backfillSubType(instance: Database.Database, table: string, entityType: string): void {
  if (!hasTable(instance, table)) return
  if (!readColumnNames(instance, table).has('kind')) return
  instance
    .prepare(
      `UPDATE world_entities
       SET sub_type = (SELECT kind FROM ${table} WHERE entity_id = world_entities.id)
       WHERE entity_type = ?
         AND sub_type = ''
         AND EXISTS (
           SELECT 1 FROM ${table}
           WHERE entity_id = world_entities.id AND kind <> ''
         )`
    )
    .run(entityType)
}

/** 按 sub_type 补齐子分类行：预设 → 专属子表，非预设非空 → `world_custom`。 */
function ensureSubtypeRows(
  instance: Database.Database,
  entityType: string,
  presets: Readonly<Record<string, string>>
): void {
  for (const [subType, table] of Object.entries(presets)) {
    instance
      .prepare(
        `INSERT OR IGNORE INTO ${table} (entity_id)
         SELECT id FROM world_entities WHERE entity_type = ? AND sub_type = ?`
      )
      .run(entityType, subType)
  }

  const presetNames = Object.keys(presets)
  const placeholders = presetNames.map(() => '?').join(', ')
  // 历史迁移（第 3 批）落点：`world_custom` 旧结构为「实体一行」（有默认列），此处补空行。
  // 第 5 批起该表是键值行式（`field_key` 无默认值），本语句在 `INSERT OR IGNORE` 下
  // 自然不产生行（自定义字段改为写入时按需插行）；第 5 批重建迁移在此之后整表重建。
  instance
    .prepare(
      `INSERT OR IGNORE INTO ${CUSTOM_TABLE} (entity_id)
       SELECT id FROM world_entities
       WHERE entity_type = ? AND sub_type <> '' AND sub_type NOT IN (${placeholders})`
    )
    .run(entityType, ...presetNames)
}

/**
 * 品阶下沉：`world_item.grade` / `rank` → 物品 5 张预设子分类表。
 *
 * 先按 `sub_type` 建行（`INSERT OR IGNORE`），再把非空 / 非零的旧值覆盖到目标行；
 * 旧值为空（`grade = ''` / `rank = 0`）时保留目标行既有值，避免二次执行清空数据。
 * `world_material` 用自身的 `grade_label`，不在下沉范围内。
 */
function shiftGradeRank(instance: Database.Database): void {
  if (!hasTable(instance, 'world_item')) return
  const columns = readColumnNames(instance, 'world_item')
  if (!columns.has('grade') && !columns.has('rank')) return

  for (const [subType, table] of Object.entries(LEGACY_ITEM_GRADE_RANK_TABLES)) {
    instance
      .prepare(
        `INSERT OR IGNORE INTO ${table} (entity_id)
         SELECT id FROM world_entities WHERE entity_type = 'item' AND sub_type = ?`
      )
      .run(subType)

    const sets: string[] = []
    if (columns.has('grade')) {
      sets.push(
        `grade = COALESCE(NULLIF((SELECT i.grade FROM world_item i WHERE i.entity_id = ${table}.entity_id), ''), grade)`
      )
    }
    if (columns.has('rank')) {
      sets.push(
        `rank = COALESCE(NULLIF((SELECT i.rank FROM world_item i WHERE i.entity_id = ${table}.entity_id), 0), rank)`
      )
    }
    instance
      .prepare(
        `UPDATE ${table} SET ${sets.join(', ')}
         WHERE entity_id IN (SELECT entity_id FROM world_item)`
      )
      .run()
  }
}

/** 写入迁移守卫键（迁移内直读写，避免重入 `getDb()`）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(GRADE_RANK_DOWN_KEY)
}

/** 执行迁移（幂等）。 */
export function migrateWorldItemGradeRankDown(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(GRADE_RANK_DOWN_KEY)
  if (done) return

  // 第 4 批：新库主表已无 `sub_type` 文本列（旧文本 → `subtype_id`），下面 1~3 步都按名称
  // 读写该列，列不存在时整段跳过（此时也不会有待迁移的 `world_item`）。
  const hasLegacySubType = readColumnNames(instance, 'world_entities').has('sub_type')

  instance.transaction(() => {
    if (hasLegacySubType) {
      // 1) 老库兼容：kind → sub_type 回填（新库 / 已迁移库为无操作）。
      for (const { table, entityType } of KIND_TABLES) {
        backfillSubType(instance, table, entityType)
      }
      // 2) 回填后补齐子分类行（预设 → 专属子表，非预设 → world_custom）。
      ensureSubtypeRows(instance, 'item', LEGACY_ITEM_SUBTYPE_TABLES)
      ensureSubtypeRows(instance, 'faction', LEGACY_FACTION_SUBTYPE_TABLES)
      // 3) 品阶下沉（须在删 world_item 之前）。
      shiftGradeRank(instance)
    }
    // 4) 下线三张模块子表（空壳 / 字段已废弃或下沉）。
    for (const table of LEGACY_MODULE_TABLES) {
      instance.exec(`DROP TABLE IF EXISTS ${table}`)
    }
    // 5) 置守卫键。
    markMigrationDone(instance)
  })()
}
