import type Database from 'better-sqlite3'
import { createWorldEntitiesSchema, worldEntitiesTableDdl } from './schema/worldEntities'
import { LEGACY_ENTITY_VIEWS } from './worldPowerSystemMigration'

/**
 * 一次性迁移：删除简介列（五域统一）。
 *
 * 背景：用户确认五域统一删 `world_entities.summary`，`world_power_system.summary`
 * （第 6 批已废弃）一并删除，历史数据直接丢弃。简介后续走正文，本批读写先删，
 * 展示下一批接正文。
 *
 * 手法与既有重建迁移一致：
 * - `world_entities` 整表重建（建 `world_entities_new` → 显式列复制 →
 *   `DROP` 旧表 → `RENAME` → 恢复自增序号 → 重建索引 / 触发器 → 外键校验）；
 * - `world_power_system.summary` 无索引 / 无约束引用，直接
 *   `ALTER TABLE ... DROP COLUMN`；
 * - `PRAGMA foreign_keys = OFF` 必须在事务外执行（事务内设置会被忽略）。
 *
 * 幂等：settings 键 `worldEntities:dropSummary:v1` 守卫（只执行一次）。探测方式为
 * `PRAGMA table_info` 是否仍含 `summary`：两表均无该列时直接置键跳过。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，在
 * `migrateWorldEntitiesDropSubTypeText`（`sub_type` 文本列已收敛）之后、种子之前。
 * 依赖 DDL 已去掉 `summary`（`schema/worldEntities.ts` / `schema/worldPowers.ts`）。
 */

/** 一次性迁移守卫键。 */
const DROP_SUMMARY_KEY = 'worldEntities:dropSummary:v1'

/** 实测某表列名集合（表不存在时返回空集）。 */
function readColumnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/** 写入迁移守卫键（迁移内直读写，避免重入 `getDb()`）。 */
function markMigrationDone(instance: Database.Database): void {
  instance
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, '1')
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(DROP_SUMMARY_KEY)
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
export function migrateWorldEntitiesDropSummary(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(DROP_SUMMARY_KEY)
  if (done) return

  const entityColumns = readColumnNames(instance, 'world_entities')
  const hasEntitySummary = entityColumns.has('summary')
  const hasPowerSummary = readColumnNames(instance, 'world_power_system').has('summary')

  // 两表均已无简介列（新库首启）：只置键。
  if (!hasEntitySummary && !hasPowerSummary) {
    instance.transaction(() => markMigrationDone(instance))()
    return
  }

  const oldSeqRow = hasEntitySummary
    ? (instance.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'world_entities'").get() as
        { seq: number } | undefined)
    : undefined
  const oldSeq = oldSeqRow?.seq ?? null

  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      // 1) 子表简介列：无依赖对象，直接删列（历史数据丢弃）。
      if (hasPowerSummary) {
        instance.exec('ALTER TABLE world_power_system DROP COLUMN summary')
      }

      // 2) 主表简介列：整表重建（显式列复制，不含 `summary`；历史数据丢弃）。
      if (hasEntitySummary) {
        for (const view of LEGACY_ENTITY_VIEWS) {
          instance.exec(`DROP VIEW IF EXISTS ${view}`)
        }
        instance.exec('DROP TABLE IF EXISTS world_entities_new')
        instance.exec(worldEntitiesTableDdl('world_entities_new'))
        instance.exec(`
          INSERT INTO world_entities_new
            (id, uuid, book_id, entity_type, subtype_id, name,
             revision, created_at, updated_at, deleted_at)
          SELECT id, uuid, book_id, entity_type, subtype_id, name,
                 revision, created_at, updated_at, deleted_at
          FROM world_entities
        `)
        instance.exec('DROP TABLE world_entities')
        instance.exec('ALTER TABLE world_entities_new RENAME TO world_entities')
        restoreAutoincrementSeq(instance, oldSeq)
        createWorldEntitiesSchema(instance)
      }

      // 3) 提交前外键校验：有任何违例行即抛错回滚。
      const violations = instance.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (violations.length > 0) {
        throw new Error(`world_entities 删简介列后外键校验失败：${violations.length} 行`)
      }

      markMigrationDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}
