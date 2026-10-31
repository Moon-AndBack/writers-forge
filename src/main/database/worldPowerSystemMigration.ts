import type Database from 'better-sqlite3'
import { createWorldEntitiesSchema, worldEntitiesTableDdl } from './schema/worldEntities'

/**
 * 一次性迁移：把「境界体系」从世界观子类型升级为**第五类实体** `entity_type='power_system'`。
 *
 * 背景：`world_entities.entity_type` 的 CHECK 只允许四类，而 SQLite **无法 ALTER CHECK**，
 * 老库插入 `power_system` 会直接抛 `CHECK constraint failed`，只能重建主表。
 *
 * 关键约束（已实测）：
 * - `PRAGMA foreign_keys = OFF` **必须在事务外**设置（事务内设置被忽略），否则
 *   `DROP TABLE world_entities` 会级联清空 49 处外键引用它的子表数据；
 * - **先 DROP 视图再 RENAME**：视图依赖主表，`ALTER TABLE ... RENAME` 遇到引用不存在
 *   表的视图会报 `error in view v_...: no such table`；
 * - **绝不能先给旧表改名**（3.25+ 会重写其它表外键定义的表名）。正确顺序：
 *   建 `world_entities_new` → 复制数据 → `DROP TABLE world_entities` →
 *   `ALTER TABLE world_entities_new RENAME TO world_entities`；
 * - `AUTOINCREMENT` 序号随 DROP 丢失，须读旧 `sqlite_sequence.seq` 并在改名后取较大值；
 * - 索引 / 触发器随旧表 DROP 消失，复制完成后复用 `createWorldEntitiesSchema` 重建
 *   （与新库同一份 DDL，避免新库 / 迁移库结构漂移）；
 * - `PRAGMA foreign_key_check` 放在 COMMIT 前，有违例行即抛错回滚。
 *
 * 数据口径：
 * - `entity_type='worldview' AND sub_type='境界体系'` → `power_system`；
 * - `sub_type` **保留原值**（不丢信息，展示层自行忽略）；
 * - 软删行（`deleted_at` 非空）同样迁移；
 * - 转换后删除其在 `world_worldview` 的旧子行（老库；该表已于第 3 批下线，缺失时跳过，
 *   否则 `world.entityChildMismatch` 立即报错），
 *   并为所有 `power_system` 主行补建 `world_power_system` 子行（`OR IGNORE` 保留既有
 *   `kind`；简介列 `summary` 已下线，见 `worldEntitiesDropSummary.ts`）。
 *
 * 幂等：settings 键 `worldEntities:powerSystemType:v1` 守卫（只执行一次）；若表结构已含
 * `power_system`（新库首启 / 迁移已完成但键丢失），只补数据 + 置键，不重建。
 * 整体事务包裹，任一步失败即回滚且不置键，下次启动自动重试。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，须在 `createWorldPowersSchema`（子表存在）
 * 与 `createPlotSchema` 之后、`seedDemoWorldEntities` 之前。
 */

/** 一次性迁移守卫键。 */
const POWER_SYSTEM_TYPE_KEY = 'worldEntities:powerSystemType:v1'

/**
 * 第 2 批随主表一并下线的五个聚合视图（`v_worldview` 等）。
 *
 * 保留此清单仅为**老库兼容**：视图依赖主表，重建 / 改名之前必须先 DROP，否则
 * `ALTER TABLE ... RENAME` 会报 `error in view v_...: no such table`。
 * `database/worldEntitiesDropUnusedColumns.ts` 复用同一份清单。
 */
export const LEGACY_ENTITY_VIEWS: readonly string[] = [
  'v_worldview',
  'v_character',
  'v_item',
  'v_faction',
  'v_power_system'
]

/** 读取主表建表 SQL（用于判断是否已含 `power_system`）。 */
function readWorldEntitiesSql(instance: Database.Database): string {
  const row = instance
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'world_entities'")
    .get() as { sql: string } | undefined
  return row?.sql ?? ''
}

/** 写入迁移守卫键（迁移内直读写，避免重入 `getDb()`）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(POWER_SYSTEM_TYPE_KEY)
}

/** 表是否存在（`world_worldview` 已在第 3 批下线，新库无此表）。 */
function hasTable(instance: Database.Database, table: string): boolean {
  const row = instance
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  return Boolean(row)
}

/** 修复子表归属：删 `world_worldview` 误挂行（老库），补 `world_power_system` 子行（保留 kind；简介列已下线）。 */
function repairPowerSystemChildren(instance: Database.Database): void {
  if (hasTable(instance, 'world_worldview')) {
    instance.exec(
      `DELETE FROM world_worldview
       WHERE entity_id IN (SELECT id FROM world_entities WHERE entity_type = 'power_system')`
    )
  }
  instance.exec(
    `INSERT OR IGNORE INTO world_power_system (entity_id)
     SELECT id FROM world_entities WHERE entity_type = 'power_system'`
  )
}

/** 恢复 AUTOINCREMENT 序号：取旧序号与新最大 id 的较大者。 */
function restoreAutoincrementSeq(instance: Database.Database, oldSeq: number | null): void {
  if (oldSeq === null) return
  const current = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'world_entities'")
    .get() as { seq: number } | undefined
  if (current) {
    instance
      .prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = 'world_entities'")
      .run(oldSeq)
  } else {
    instance
      .prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('world_entities', ?)")
      .run(oldSeq)
  }
}

/** 执行迁移（幂等）。 */
export function migrateWorldEntityPowerSystemType(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(POWER_SYSTEM_TYPE_KEY)
  if (done) return

  // 已是新结构（新库首启，或迁移完成但守卫键丢失）：只补数据，不重建表。
  if (readWorldEntitiesSql(instance).includes("'power_system'")) {
    instance.transaction(() => {
      repairPowerSystemChildren(instance)
      markMigrationDone(instance)
    })()
    return
  }

  const oldSeqRow = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'world_entities'")
    .get() as { seq: number } | undefined
  const oldSeq = oldSeqRow?.seq ?? null

  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      // 1) 视图依赖主表：DROP / RENAME 前必须先删，否则 RENAME 报 no such table。
      for (const view of LEGACY_ENTITY_VIEWS) {
        instance.exec(`DROP VIEW IF EXISTS ${view}`)
      }

      // 2) 建新表（与新建库共用同一份列定义）并复制数据。
      //    第 2 批起主表已删 `status` / `source` / `visibility` / `parent_id`，复制清单同步收敛；
      //    此处**不**复制 `subtype_id`（老库路径不假设该列存在），其回填由
      //    `worldEntitiesDropUnusedColumns.ts` 统一负责。
      instance.exec('DROP TABLE IF EXISTS world_entities_new')
      // 第 4 批：新库 DDL 已无 `sub_type` 文本列，但本迁移必须把老文本搬到新表，
      // 交由 `worldEntitiesDropSubTypeText.ts` 回填 `subtype_id` 后再删列，故显式要求保留。
      instance.exec(worldEntitiesTableDdl('world_entities_new', { legacySubType: true }))
      // 注：简介列 `summary` 已下线（见 `worldEntitiesDropSummary.ts`），
      // 本迁移为已执行历史逻辑，保持原列清单不变，不追改。
      instance.exec(`
        INSERT INTO world_entities_new
          (id, uuid, book_id, entity_type, sub_type, name, summary, revision,
           created_at, updated_at, deleted_at)
        SELECT id, uuid, book_id,
               CASE
                 WHEN entity_type = 'worldview' AND sub_type = '境界体系' THEN 'power_system'
                 ELSE entity_type
               END,
               sub_type, name, summary, revision,
               created_at, updated_at, deleted_at
        FROM world_entities
      `)

      // 3) 删旧表 → 新表改名（顺序不可交换；见文件头）。
      instance.exec('DROP TABLE world_entities')
      instance.exec('ALTER TABLE world_entities_new RENAME TO world_entities')

      // 4) 恢复自增序号（AUTOINCREMENT 序号随 DROP 丢失）。
      restoreAutoincrementSeq(instance, oldSeq)

      // 5) 子表归属修复：worldview 子行删除、power_system 子行补建。
      repairPowerSystemChildren(instance)

      // 6) 重建索引 / 触发器 / 视图（复用新库同一份 DDL）。
      createWorldEntitiesSchema(instance)

      // 7) 提交前外键校验：有任何违例行即抛错回滚。
      const violations = instance.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (violations.length > 0) {
        throw new Error(`world_entities 重建后外键校验失败：${violations.length} 行`)
      }

      markMigrationDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}
