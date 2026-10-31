import type Database from 'better-sqlite3'

/**
 * AI 对话域 schema：`ai_chat_sessions`（会话）+ `ai_chat_messages`（多轮消息）。
 *
 * 设计要点：
 * - **会话按章归属**：`chapter_id` 外键指向 `chapters(id)`，`book_id` 冗余记录所属书，
 *   便于按书 + 章直接取会话列表（索引 `(book_id, chapter_id)`），也便于删书时整书级联；
 * - **两级级联**：删书 → 该书全部会话（`book_id` 外键）→ 会话下全部消息
 *   （`session_id` 外键）；删章（物理删除）→ 该章全部会话 → 全部消息；
 *   常规删章走软删除（`chapters.deleted_at`），不触发级联，会话随章还原一起保留；
 * - **无软删除**：对话记录是过程数据，不做回收站，删除即物理删除 + 级联；
 * - `role` 仅 `system` / `user` / `assistant` 三态，由 SQL CHECK 守卫；
 * - `usage_json` 存模型返回的 token 用量等原样 JSON 文本（可空），结构由上层解释，
 *   本层不解析、不校验；
 * - `updated_at` 在追加消息 / 重命名 / 流式结束（`touchAiSession`）时刷新，供会话按
 *   最近活跃倒序排列；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`），无迁移、无回填。
 */
export function createAiChatSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      chapter_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      usage_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
    )
  `)

  // 索引：按书 + 章查会话列表；按会话按 id 升序取消息（主键 id 已在索引尾部，免回表排序）。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_book_chapter
      ON ai_chat_sessions(book_id, chapter_id)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session
      ON ai_chat_messages(session_id, id)
  `)
}
