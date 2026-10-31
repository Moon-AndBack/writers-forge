import type Database from 'better-sqlite3'

/**
 * 实体域 schema：三表规范化（`entities` / `entity_aliases` / `entity_relations`）。
 *
 * 设计要点：
 * - 实体按书隔离：三表均可经 `entities.book_id` 回溯到 `books.id`；
 * - `entities.book_id` 外键 ON DELETE CASCADE：删书联动删除其全部实体；
 * - 别名 / 关系随实体级联删除（`entity_id` / `target_id` 均 ON DELETE CASCADE）；
 * - 全部使用 `CREATE ... IF NOT EXISTS`，保证幂等，对齐 `database/index.ts` 既有风格。
 *
 * 迁移路径：老用户库（已存在但无这些表）在 `getDb()` 首次打开时执行本函数即可补齐，
 * 不涉及列变更，无需数据回填。
 */
export function createEntitySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES entities(id) ON DELETE CASCADE
    )
  `)

  // 索引：列表按书、按书+类型；别名匹配与反向查；关系正反向查。
  db.exec('CREATE INDEX IF NOT EXISTS idx_entities_book ON entities(book_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_entities_book_type ON entities(book_id, type)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases(alias)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_entity_aliases_entity ON entity_aliases(entity_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_entity_relations_entity ON entity_relations(entity_id)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_entity_relations_target ON entity_relations(target_id)')
}
