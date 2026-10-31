import type Database from 'better-sqlite3'

/**
 * 统一设定库 schema · 子类分类表（`world_subtypes`）。
 *
 * 背景：本表是「书 → 实体类型 → 子类」的**分类唯一真源**。第 1 批先建表，第 2 批给主表
 * 加可空外键列，第 4 批完成切换：`world_entities.subtype_id` → 本表 `id`
 * （`ON DELETE SET NULL`），主表原 `sub_type` 文本列已删除（老库由
 * `database/worldEntitiesDropSubTypeText.ts` 回填后删列）。
 *
 * 结构：
 * - `book_id` → `books(id)`，删书级联删除；
 * - `entity_type` 五类 CHECK，与 `world_entities.entity_type` 枚举一致；
 * - `is_custom` = 0 表示预设子类、1 表示用户自定义；
 * - `preset_key` 为预设子类指向具体预设表的路由键（自定义为空串）；
 * - 软删除：`deleted_at` 非空即视为已删除，读 / 写通道默认过滤；
 * - `UNIQUE (book_id, entity_type, name)` 保证同书同类型下子类名唯一，
 *   也是预设种子 `INSERT OR IGNORE` 的幂等依据。
 */

/** 分类表名（数据层 / 自检共用，避免多处字面量漂移）。 */
export const WORLD_SUBTYPES_TABLE = 'world_subtypes'

/** 分类表按书 + 类型的查询索引名。 */
export const WORLD_SUBTYPES_BOOK_TYPE_INDEX = 'idx_world_subtypes_book_type'

export function createWorldSubtypesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_subtypes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('worldview', 'character', 'faction', 'item', 'power_system')),
      name TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
      preset_key TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      UNIQUE (book_id, entity_type, name)
    )
  `)
  db.exec(
    `CREATE INDEX IF NOT EXISTS ${WORLD_SUBTYPES_BOOK_TYPE_INDEX}
       ON ${WORLD_SUBTYPES_TABLE}(book_id, entity_type)`
  )
}
