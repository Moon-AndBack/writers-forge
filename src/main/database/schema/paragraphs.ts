import type Database from 'better-sqlite3'

/**
 * 段落表 schema：正文的唯一真源（每行一段），结构全新，无迁移。
 *
 * 设计要点：
 * - **`chapter_id` 取代 `document_id`**：段落直接归属章节（`documents` 表已消灭），
 *   外键 `ON DELETE CASCADE`：删章联动删除其全部段落；
 * - **不冗余 `book_id` / `volume_id`**：本书仅服务章节域，正文按章取即可（大纲正文内联在
 *   `outline_items.content_json`，不占用本表）；
 * - `UNIQUE(chapter_id, idx)` 保证段序唯一（**该唯一键已隐含按章取正文的索引**，
 *   不另建同名索引），`idx` 从 0 起、按升序即为正文块序，`CHECK (idx >= 0)` 守卫负段序；
 * - `content_json TEXT`：块级 Tiptap JSON 串（顶层块 node.toJSON() 的原样序列化，
 *   marks 天然包含在内），NULL = 纯文本段；`text` 列保留该块纯文本摘要，作为字数统计 /
 *   搜索的真源（与 content_json 双写，读侧以 content_json 优先）；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`），对齐 `schema/entities.ts` 既有风格，
 *   **不写任何一次性迁移**（用户手动删库，新库直建）。
 */
export function createParagraphSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS paragraphs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      idx INTEGER NOT NULL CHECK (idx >= 0),
      text TEXT NOT NULL DEFAULT '',
      content_json TEXT,
      UNIQUE (chapter_id, idx),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    )
  `)
}
