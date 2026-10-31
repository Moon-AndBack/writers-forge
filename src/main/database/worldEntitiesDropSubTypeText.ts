import type Database from 'better-sqlite3'
import { createWorldEntitiesSchema, worldEntitiesTableDdl } from './schema/worldEntities'
import { LEGACY_ENTITY_VIEWS } from './worldPowerSystemMigration'
import { PRESET_WORLD_SUBTYPES } from './worldSubtypes'

/**
 * 一次性迁移（第 4 批）：`world_entities.sub_type`（自由文本）→ `subtype_id`（外键）收口。
 *
 * 目标：删除 `sub_type` 文本列，让 `world_subtypes` 成为子类**唯一真源**；展示名 / 预设路由键
 * 一律经 `LEFT JOIN world_subtypes st ON st.id = world_entities.subtype_id` 取得
 * （`name AS subType` / `preset_key AS presetKey`）。
 *
 * 步骤：
 * 1. **兜底补列**：极端老库（早于第 2 批）若还没有 `subtype_id`，先 `ADD COLUMN`。
 * 2. **幂等补齐预设分类**（`INSERT OR IGNORE` 23 条 / 书）：老库若尚未跑过预设回填，
 *    名称匹配会全部落空并误建重复的自定义分类，故本迁移自带一次兜底
 *    （与 `worldSubtypes.ts` 的 `ensurePresetSubtypes` 同口径，此处内联避免重入 `getDb()`）。
 * 3. **回填 `subtype_id`**：对 `subtype_id IS NULL AND sub_type <> '' AND deleted_at IS NULL`
 *    的行，按 `(book_id, entity_type, name = sub_type)` 找**未软删**分类；
 *    找不到则**新建一条自定义分类**（`is_custom = 1`、`preset_key = ''`、
 *    `sort_order` = 该 (书, 类型) 当前最大值 + 1）后回填。空串保持 NULL（= 未分类）。
 * 4. **删列**：优先 `ALTER TABLE world_entities DROP COLUMN sub_type`
 *    （该列无索引 / 无 CHECK / 无视图与触发器引用，SQLite ≥ 3.35 支持）；
 *    失败则走整表重建（手法同 `worldEntitiesDropUnusedColumns.ts`：事务外
 *    `PRAGMA foreign_keys = OFF`、显式列复制、`sqlite_sequence` 恢复、`foreign_key_check` 兜底）。
 *
 * 幂等：settings 键 `worldEntities:dropSubTypeText:v1` 守卫（只执行一次）。探测方式为
 * `PRAGMA table_info(world_entities)` 是否仍含 `sub_type`：新库首启（DDL 已无该列）直接置键跳过。
 *
 * 调用位置：`database/index.ts` 的 `getDb()`，在
 * `migrateWorldEntitiesDropUnusedColumns`（第 2 批，提供 `subtype_id`）与
 * `migrateWorldItemGradeRankDown`（第 3 批，仍会写 `sub_type`）**之后**、种子之前。
 *
 * 用户已授权本批为破坏性变更（删列、必要时建自定义分类），不回滚旧文本。
 */

/** 一次性迁移守卫键。 */
const DROP_SUBTYPE_TEXT_KEY = 'worldEntities:dropSubTypeText:v1'

/** 待删除的旧文本列。 */
const LEGACY_COLUMN = 'sub_type'

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
    .run(DROP_SUBTYPE_TEXT_KEY)
}

/** 为指定书幂等补齐 23 条预设分类（书不存在时跳过，避免外键报错）。 */
function ensurePresets(instance: Database.Database, bookId: string): void {
  const book = instance.prepare('SELECT 1 FROM books WHERE id = ?').get(bookId)
  if (!book) return
  const insert = instance.prepare(
    `INSERT OR IGNORE INTO world_subtypes
       (book_id, entity_type, name, is_custom, preset_key, sort_order)
     VALUES (?, ?, ?, 0, ?, ?)`
  )
  for (const preset of PRESET_WORLD_SUBTYPES) {
    insert.run(bookId, preset.entityType, preset.name, preset.presetKey, preset.sortOrder)
  }
}

/** 待回填行：仍无分类、旧文本非空、未软删。 */
interface PendingRow {
  id: number
  bookId: string
  entityType: string
  subType: string
}

/**
 * 回填 `subtype_id`（幂等）：先按名称找既有分类，找不到则建自定义分类后回填。
 * 返回新建的自定义分类条数（仅用于日志口径）。
 */
function backfillSubtypeIds(instance: Database.Database): number {
  const pending = instance
    .prepare(
      `SELECT id, book_id AS bookId, entity_type AS entityType, sub_type AS subType
       FROM world_entities
       WHERE subtype_id IS NULL AND sub_type <> '' AND deleted_at IS NULL
       ORDER BY id`
    )
    .all() as PendingRow[]
  if (pending.length === 0) return 0

  const findSubtype = instance.prepare(
    `SELECT id FROM world_subtypes
     WHERE book_id = ? AND entity_type = ? AND name = ? AND deleted_at IS NULL
     ORDER BY id LIMIT 1`
  )
  const nextSortOrder = instance.prepare(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
     FROM world_subtypes WHERE book_id = ? AND entity_type = ?`
  )
  const insertCustom = instance.prepare(
    `INSERT OR IGNORE INTO world_subtypes
       (book_id, entity_type, name, is_custom, preset_key, sort_order)
     VALUES (?, ?, ?, 1, '', ?)`
  )
  // 唯一键不区分软删：万一同名行已软删，`INSERT OR IGNORE` 不生效，按原名回查兜底。
  const findAnySubtype = instance.prepare(
    `SELECT id FROM world_subtypes
     WHERE book_id = ? AND entity_type = ? AND name = ?
     ORDER BY id LIMIT 1`
  )
  const updateEntity = instance.prepare('UPDATE world_entities SET subtype_id = ? WHERE id = ?')

  let createdCount = 0
  for (const row of pending) {
    const found = findSubtype.get(row.bookId, row.entityType, row.subType) as
      | { id: number }
      | undefined
    let subtypeId = found?.id
    if (subtypeId === undefined) {
      const next = nextSortOrder.get(row.bookId, row.entityType) as { next: number }
      const result = insertCustom.run(row.bookId, row.entityType, row.subType, next.next)
      if (Number(result.changes) > 0) {
        subtypeId = Number(result.lastInsertRowid)
        createdCount += 1
      } else {
        const existing = findAnySubtype.get(row.bookId, row.entityType, row.subType) as
          | { id: number }
          | undefined
        subtypeId = existing?.id
      }
    }
    if (subtypeId !== undefined) updateEntity.run(subtypeId, row.id)
  }
  return createdCount
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

/** 优先原地删列；该列无依赖对象时 SQLite 直接支持（失败只回 false，事务仍可继续）。 */
function tryDropColumn(instance: Database.Database): boolean {
  try {
    instance.exec(`ALTER TABLE world_entities DROP COLUMN ${LEGACY_COLUMN}`)
    return true
  } catch {
    return false
  }
}

/**
 * 删列兜底：整表重建（`DROP COLUMN` 不可用时）。
 *
 * 顺序与两份历史重建迁移一致：清视图 → 建新表 → 复制显式列 → 删旧表 → 改名 →
 * 恢复自增序号 → 复用 `createWorldEntitiesSchema` 重建索引 / 触发器。
 */
function rebuildWithoutLegacyColumn(instance: Database.Database): void {
  const oldSeqRow = instance
    .prepare("SELECT seq FROM sqlite_sequence WHERE name = 'world_entities'")
    .get() as { seq: number } | undefined

  for (const view of LEGACY_ENTITY_VIEWS) {
    instance.exec(`DROP VIEW IF EXISTS ${view}`)
  }
  instance.exec('DROP TABLE IF EXISTS world_entities_new')
  instance.exec(worldEntitiesTableDdl('world_entities_new'))
  // 注：简介列 `summary` 已下线（见 `worldEntitiesDropSummary.ts`），
  // 本迁移为已执行历史逻辑，保持原列清单不变，不追改。
  instance.exec(`
    INSERT INTO world_entities_new
      (id, uuid, book_id, entity_type, subtype_id, name, summary, revision,
       created_at, updated_at, deleted_at)
    SELECT id, uuid, book_id, entity_type, subtype_id, name, summary, revision,
           created_at, updated_at, deleted_at
    FROM world_entities
  `)
  instance.exec('DROP TABLE world_entities')
  instance.exec('ALTER TABLE world_entities_new RENAME TO world_entities')
  restoreAutoincrementSeq(instance, oldSeqRow?.seq ?? null)
  createWorldEntitiesSchema(instance)
}

/** 执行迁移（幂等）。 */
export function migrateWorldEntitiesDropSubTypeText(instance: Database.Database): void {
  const done = instance.prepare('SELECT 1 FROM settings WHERE key = ?').get(DROP_SUBTYPE_TEXT_KEY)
  if (done) return

  const hasLegacyColumn = readColumnNames(instance, 'world_entities').has(LEGACY_COLUMN)
  if (!hasLegacyColumn || !hasTable(instance, 'world_subtypes')) {
    // 新库首启（DDL 已无该列）或已收敛：只置键。
    instance.transaction(() => markMigrationDone(instance))()
    return
  }

  instance.pragma('foreign_keys = OFF')
  try {
    instance.transaction(() => {
      // 1) 老库若还没有 `subtype_id`（极端路径，早于第 2 批）：先补列。
      if (!readColumnNames(instance, 'world_entities').has('subtype_id')) {
        instance.exec(
          `ALTER TABLE world_entities
             ADD COLUMN subtype_id INTEGER REFERENCES world_subtypes(id) ON DELETE SET NULL`
        )
      }

      // 2) 预设分类兜底：保证后续名称匹配命中预设而非误建自定义分类。
      const books = instance
        .prepare(
          `SELECT book_id AS bookId FROM world_entities
           WHERE subtype_id IS NULL AND ${LEGACY_COLUMN} <> '' AND deleted_at IS NULL
           GROUP BY book_id`
        )
        .all() as Array<{ bookId: string }>
      for (const { bookId } of books) ensurePresets(instance, bookId)

      // 3) 回填 `subtype_id`（匹配不到则建自定义分类）。
      backfillSubtypeIds(instance)

      // 4) 删列（失败则整表重建）。
      if (!tryDropColumn(instance)) rebuildWithoutLegacyColumn(instance)

      // 5) 提交前外键校验：有任何违例行即抛错回滚。
      const violations = instance.prepare('PRAGMA foreign_key_check').all() as unknown[]
      if (violations.length > 0) {
        throw new Error(`world_entities 删子类文本列后外键校验失败：${violations.length} 行`)
      }

      markMigrationDone(instance)
    })()
  } finally {
    instance.pragma('foreign_keys = ON')
  }
}
