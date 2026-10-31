import type Database from 'better-sqlite3'
import { createWorldEntitiesSchema, worldEntitiesTableDdl } from './schema/worldEntities'
import { LEGACY_ENTITY_VIEWS } from './worldPowerSystemMigration'

/**
 * 一次性迁移（第 2 批）：重建 `world_entities`，删除四个废弃列并新增 `subtype_id`。
 *
 * 删除列：`status` / `source` / `visibility` / `parent_id` —— 全库零读零写（`status` 为
 * 检测探针），保留它们只会让「主表结构 = 设计清单」失真。
 * 新增列：`subtype_id INTEGER REFERENCES world_subtypes(id) ON DELETE SET NULL`，可空，
 * **本批只建列不启用读写**；`sub_type` → 外键的切换由第 4 批
 * `worldEntitiesDropSubTypeText.ts` 完成（回填后删列）。
 *
 * 手法与 `worldPowerSystemMigration.ts` 完全一致（同为「复制 → 删旧 → 改名」重建）：
 * - `PRAGMA foreign_keys = OFF` **必须在事务外**执行（事务内设置会被忽略），否则
 *   `DROP TABLE world_entities` 会级联清空子表数据；
 * - **先 DROP 视图再重建**：视图依赖主表，`ALTER TABLE ... RENAME` 遇到引用不存在表的
 *   视图会报 `error in view v_...: no such table`；本批视图整体下线，老库残留的五个
 *   视图（`LEGACY_ENTITY_VIEWS`）必须全部删除；
 * - **绝不能先给旧表改名**（3.25+ 会重写其它表外键定义的表名）。顺序：
 *   建 `world_entities_new` → 复制数据 → `DROP TABLE world_entities` →
 *   `ALTER TABLE world_entities_new RENAME TO world_entities`；
 * - `AUTOINCREMENT` 序号随 DROP 丢失，须读旧 `sqlite_sequence.seq` 并在改名后取较大值
 *   （保证 `id` 不复用）；
 * - 索引随旧表 DROP 消失，复制完成后复用 `createWorldEntitiesSchema` 重建（与新库同一份
 *   DDL，避免新库 / 迁移库结构漂移）；
 * - `PRAGMA foreign_key_check` 放在 COMMIT 前，有违例行即抛错回滚。
 *
 * `subtype_id` 回填：对 `subtype_id IS NULL AND sub_type <> ''` 的行，按
 * `(book_id, entity_type, name = sub_type)` 在 `world_subtypes` 找**未软删**分类并回填；
 * 找不到（用户自建但未登记分类的旧文本）保持 NULL，交由下一批统一收敛。
 *
 * 幂等：settings 键 `worldEntities:dropUnusedColumns:v1` 守卫（只执行一次）。探测方式为
 * `PRAGMA table_info(world_entities)` 是否仍含 `status`：新库首启、或已由
 * `worldPowerSystemMigration` 用同一份新 DDL 重建过的老库，都直接置键跳过重建
 * （跳过时仍补一次 `subtype_id` 回填，保证上一路径丢的回填不丢）。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，在 `createWorldSubtypesSchema`（回填目标表）与
 * `migrateWorldEntityPowerSystemType` **之后**、种子之前。
 * 必须排在 power_system 迁移之后：那份迁移负责把 `境界体系` 行改成 `power_system` 类型，
 * 它靠「主表 DDL 已含 power_system」判断是否已迁移；若本迁移先跑，主表变成新 DDL，
 * 该迁移会误判「数据已迁移」而漏掉类型转换。
 */

/** 一次性迁移守卫键。 */
const DROP_UNUSED_COLUMNS_KEY = 'worldEntities:dropUnusedColumns:v1'

/** 检测探针：该列存在即说明主表仍是旧结构。 */
const PROBE_COLUMN = 'status'

/** 被删的两个旧索引（列随之删除，索引必须先清）。 */
const LEGACY_INDEXES: readonly string[] = [
  'idx_world_entities_book_type_status',
  'idx_world_entities_parent'
]

/** 实测某表列名集合（表不存在时返回空集）。 */
function readColumnNames(instance: Database.Database, table: string): Set<string> {
  const rows = instance.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

/** 表是否存在（`world_subtypes` 为回填目标，缺失时跳过回填）。 */
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
    .run(DROP_UNUSED_COLUMNS_KEY)
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

/**
 * 回填 `subtype_id`（幂等）：按 `(book_id, entity_type, name = sub_type)` 匹配未软删分类。
 * 匹配不到时子查询返回 NULL，等于不变更该行。
 */
function backfillSubtypeIds(instance: Database.Database): void {
  if (!hasTable(instance, 'world_subtypes')) return
  // 第 4 批：新库 / 已删列库没有 `sub_type`，跳过（回填由
  // `worldEntitiesDropSubTypeText.ts` 负责；此处只服务尚未跑过它的老库）。
  if (!readColumnNames(instance, 'world_entities').has('sub_type')) return
  instance.exec(`
    UPDATE world_entities
    SET subtype_id = (
      SELECT s.id FROM world_subtypes s
      WHERE s.book_id = world_entities.book_id
        AND s.entity_type = world_entities.entity_type
        AND s.name = world_entities.sub_type
        AND s.deleted_at IS NULL
      ORDER BY s.id
      LIMIT 1
    )
    WHERE subtype_id IS NULL AND sub_type <> ''
  `)
}

/** 执行迁移（幂等）。 */
export function migrateWorldEntitiesDropUnusedColumns(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(DROP_UNUSED_COLUMNS_KEY)
  if (done) return

  const columns = readColumnNames(instance, 'world_entities')

  // 已是新结构（新库首启，或已被同 DDL 的重建迁移收敛）：不重建，只补回填 + 置键。
  if (!columns.has(PROBE_COLUMN)) {
    instance.transaction(() => {
      if (columns.has('subtype_id')) backfillSubtypeIds(instance)
      markMigrationDone(instance)
    })()
    return
  }

  // 旧库可能已被加过 `subtype_id`（灰度 / 半途中断）：有则原样复制，无则填 NULL。
  const selectSubtypeId = columns.has('subtype_id') ? 'subtype_id' : 'NULL'

  const oldSeqRow = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'world_entities'")
    .get() as { seq: number } | undefined
  const oldSeq = oldSeqRow?.seq ?? null

  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      // 1) 依赖主表的派生对象先清：视图（列已删，视图定义会失效）+ 两个旧索引。
      for (const view of LEGACY_ENTITY_VIEWS) {
        instance.exec(`DROP VIEW IF EXISTS ${view}`)
      }
      for (const index of LEGACY_INDEXES) {
        instance.exec(`DROP INDEX IF EXISTS ${index}`)
      }

      // 2) 建新表（与新库共用同一份列定义）并复制剩余列（显式列清单）。
      instance.exec('DROP TABLE IF EXISTS world_entities_new')
      // 第 4 批：`sub_type` 已从新库 DDL 移除，但本次重建必须保留旧文本，
      // 由 `worldEntitiesDropSubTypeText.ts` 回填 `subtype_id` 后再删列。
      instance.exec(worldEntitiesTableDdl('world_entities_new', { legacySubType: true }))
      // 注：简介列 `summary` 已下线（见 `worldEntitiesDropSummary.ts`），
      // 本迁移为已执行历史逻辑，保持原列清单不变，不追改。
      instance.exec(`
        INSERT INTO world_entities_new
          (id, uuid, book_id, entity_type, sub_type, subtype_id, name, summary,
           revision, created_at, updated_at, deleted_at)
        SELECT id, uuid, book_id, entity_type, sub_type, ${selectSubtypeId}, name, summary,
               revision, created_at, updated_at, deleted_at
        FROM world_entities
      `)

      // 3) 删旧表 → 新表改名（顺序不可交换；见文件头）。
      instance.exec('DROP TABLE world_entities')
      instance.exec('ALTER TABLE world_entities_new RENAME TO world_entities')

      // 4) 恢复自增序号（AUTOINCREMENT 序号随 DROP 丢失）。
      restoreAutoincrementSeq(instance, oldSeq)

      // 5) 重建索引 / 触发器（复用新库同一份 DDL；视图不再创建）。
      createWorldEntitiesSchema(instance)

      // 6) 回填 `subtype_id`（找不到分类的行保持 NULL，下一批统一处理）。
      backfillSubtypeIds(instance)

      // 7) 提交前外键校验：有任何违例行即抛错回滚。
      const violations = instance.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (violations.length > 0) {
        throw new Error(`world_entities 删列重建后外键校验失败：${violations.length} 行`)
      }

      markMigrationDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}
