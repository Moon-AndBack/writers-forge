import type Database from 'better-sqlite3'

/**
 * 分类域 schema：`categories`（起点官方分类 + 用户自定义分类的统一两级树）。
 *
 * 设计要点：
 * - **按频道隔离**：`channel` 三值 `male` / `female` / `publish`；自定义分类 `channel IS NULL`
 *   （表级 CHECK 保证自定义分类不属任何官方频道）；
 * - **两级结构**：`parent_id IS NULL` = 一级分类，非空 = 二级（指向一级 `id`）。
 *   自引用外键 `ON DELETE CASCADE`：删一级联动删其全部二级
 *   （本批**不提供**删除功能，级联仅为后续批次预留的完整性保证）；
 * - `origin_id` 为**起点官方 ID**（一级 = chanId，二级 = subtype），供后续与官方数据对齐；
 *   自定义分类为 NULL；
 * - `name` 为**中文原文**（不译项，不进 i18n，见 AGENTS §10）；
 * - `sort_order` = 列表顺序（一级 / 二级各自独立的下标空间，从 0 递增）；
 * - `is_custom`：0 = 官方，1 = 用户自定义；
 * - 全部 `CREATE ... IF NOT EXISTS`，幂等；**不写任何一次性迁移**
 *   （用户手动删库，新库直建）。
 */
export function createCategorySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_id INTEGER,
      channel TEXT,
      parent_id INTEGER,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (channel IS NULL OR channel IN ('male', 'female', 'publish')),
      CHECK (is_custom = 0 OR channel IS NULL),
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `)

  // 索引：按频道取分类树（一级 / 二级按同序取出）。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_categories_channel
      ON categories(channel, parent_id, sort_order)
  `)
}
