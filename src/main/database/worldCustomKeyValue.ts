import type Database from 'better-sqlite3'
import { CUSTOM_TABLE, createWorldCustomSchema } from './schema/worldCustom'

/**
 * 一次性迁移（第 5 批）：`world_custom` 由**固定 4 列**改造为**键值行式**。
 *
 * 旧结构（批 L1）：
 * ```
 * world_custom (entity_id PK, notes, tags, custom_type, extra)
 * ```
 * 新结构：
 * ```
 * world_custom (entity_id, field_key, field_value, sort_order,
 *               PRIMARY KEY (entity_id, field_key))
 * ```
 *
 * 数据处置：**用户已授权丢弃旧数据**（旧 4 列的自由文本无法无损拆成键值对）。
 * 故直接 `DROP TABLE` → 按新 DDL 重建 → 建索引 `idx_world_custom_entity`；
 * 不读取、不搬运任何旧列。
 *
 * 手法与既有重建迁移一致：
 * - `PRAGMA foreign_keys = OFF` **必须在事务外**执行（事务内设置会被忽略），否则
 *   `DROP TABLE` 的语义受外键影响；
 * - 事务包裹「删表 → 建表 → 外键校验 → 置键」，任一步失败即回滚且不置键，下次启动重试；
 * - `PRAGMA foreign_key_check` 放在 COMMIT 前，有违例行即抛错回滚。
 *
 * 幂等：settings 键 `worldCustom:keyValue:v1` 守卫（只执行一次）。探测方式为
 * `PRAGMA table_info(world_custom)` 是否仍含旧列 `notes`：新库首启（DDL 已无该列）
 * 或已迁移的老库直接置键跳过。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，晚于 `world_entities` 建表与
 * `migrateWorldEntitiesDropSubTypeText`（子类真源收口）、早于种子。
 */
const KEY_VALUE_MIGRATION_KEY = 'worldCustom:keyValue:v1'

/** 旧结构探针列：存在即说明仍是固定 4 列。 */
const LEGACY_PROBE_COLUMN = 'notes'

/** 实测某表列名集合（表不存在时返回空集）。 */
function readColumnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/** 表是否存在。 */
function hasTable(instance: Database.Database, table: string): boolean {
  const row = instance
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table)
  return Boolean(row)
}

/** 写入迁移守卫键（迁移内直读写，避免重入 `getDb()`）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(KEY_VALUE_MIGRATION_KEY)
}

/** 执行迁移（幂等）。 */
export function migrateWorldCustomToKeyValue(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(KEY_VALUE_MIGRATION_KEY)
  if (done) return

  const exists = hasTable(instance, CUSTOM_TABLE)
  const hasLegacyColumns =
    exists && readColumnNames(instance, CUSTOM_TABLE).has(LEGACY_PROBE_COLUMN)

  // 新库首启（表已是键值结构）或已迁移：只置键；表缺失时补建，保证后续读写有表可用。
  if (!hasLegacyColumns) {
    instance.transaction(() => {
      if (!exists) createWorldCustomSchema(instance)
      markMigrationDone(instance)
    })()
    return
  }

  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      // 1) 旧数据按授权丢弃，直接删表。
      instance.exec(`DROP TABLE ${CUSTOM_TABLE}`)
      // 2) 按新 DDL 重建（与新库同一份定义，含索引）。
      createWorldCustomSchema(instance)
      // 3) 提交前外键校验：有任何违例行即抛错回滚。
      const violations = instance.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (violations.length > 0) {
        throw new Error(`world_custom 重建后外键校验失败：${violations.length} 行`)
      }
      markMigrationDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}
