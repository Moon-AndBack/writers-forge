import type Database from 'better-sqlite3'

/**
 * AI 对话域 schema：`ai_chat_sessions`（会话）+ `ai_chat_messages`（多轮消息）。
 *
 * 设计要点：
 * - **会话按书归属（与章解耦）**：会话只有 `book_id` 外键，不含 `chapter_id`；
 *   同一本书的所有章节共用一份会话列表，切章不改变会话归属，也允许无选中章节时聊天。
 * - **消息记录来源章（纯标记）**：`ai_chat_messages.chapter_id` **可空、无外键、无级联**，
 *   记录该条消息产生时所在的章（无章聊天为 NULL）。删章不得连带删除历史消息。
 *   回插（替换选中 / 插入到光标后）的允许条件：
 *   `message.chapterId !== null && message.chapterId === 当前 chapterId`；
 *   即无章聊天产生的消息、以及来自其它章的消息都不允许回插。该字段只随消息按 id 读出后
 *   比对，不做按章检索，故不建索引。
 * - **两级级联**：删书 → 该书全部会话（`book_id` 外键）→ 会话下全部消息
 *   （`session_id` 外键）；删章只影响 `chapters` / `paragraphs`，不触碰 AI 对话。
 * - **无软删除**：对话记录是过程数据，不做回收站，删除即物理删除 + 级联；
 * - `role` 仅 `system` / `user` / `assistant` 三态，由 SQL CHECK 守卫；
 * - `usage_json` 存模型返回的 token 用量等原样 JSON 文本（可空），结构由上层解释，
 *   本层不解析、不校验；
 * - `status` 是消息的结构化收尾状态：`done`（正常完成，默认）/ `interrupted`
 *   （上游报错中断，正文只是半截）。**不把中断说明写进 `content`**——说明属于界面文案，
 *   写进正文会污染回插与后续上下文；取值不加 SQL CHECK，便于将来扩展（如 `stopped`）；
 * - `updated_at` 在追加消息 / 重命名 / 流式结束（`touchAiSession`）时刷新，供会话按
 *   最近活跃倒序排列；
 * - 幂等建表（`CREATE ... IF NOT EXISTS`）+ 幂等补列（`PRAGMA table_info` 探测后
 *   `ADD COLUMN`，对齐 `schema/plot.ts` / `schema/foreshadows.ts` 的 `ensureColumn`）。
 *
 * 一次性结构迁移（用户已授权丢弃历史 AI 对话）：v2 起会话不再绑定章节。老库以
 * `PRAGMA table_info(ai_chat_sessions)` **是否仍含 `chapter_id`** 为唯一判据，
 * 命中则整域重建（先删消息、再删会话，随后按新 DDL 重建），不复制任何旧数据。
 * 判据只看结构、不看 settings 标记：用户替换 / 回滚数据库文件后标记可能残留。
 * 重建后 `chapter_id` 不再存在，后续启动自然跳过，故「清空」只发生一次。
 */

/** 结构迁移审计标记（**不参与跳过判定**；判据始终是 `PRAGMA table_info`）。 */
const AI_SESSIONS_SCHEMA_AUDIT_KEY = 'aiChat:sessionsScope:v2'

/** 检测老库会话表是否仍绑定章节（表不存在时返回 false）。 */
function hasLegacyChapterColumn(db: Database.Database): boolean {
  const columns = db.prepare('PRAGMA table_info(ai_chat_sessions)').all() as Array<{ name: string }>
  return columns.some((column) => column.name === 'chapter_id')
}

/** 记录迁移已处理（仅审计；已有标记则不动，避免每次启动刷新时间戳）。 */
function markSessionsSchemaHandled(db: Database.Database): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, 'done') ON CONFLICT(key) DO NOTHING`
  ).run(AI_SESSIONS_SCHEMA_AUDIT_KEY)
}

/**
 * 老库一次性重建（幂等）：旧会话表含 `chapter_id` 时，丢弃该域全部历史数据。
 *
 * - **顺序**：先 `DROP ai_chat_messages`（依赖方），再 `DROP ai_chat_sessions`
 *   （被引用方），避免开着外键删除父表时触发级联 / 引用检查；
 * - 不复制任何行（用户已明确授权丢弃历史 AI 对话）；
 * - 整体事务包裹：删表与审计标记同生共死；失败抛错，下次启动自动重试；
 * - 表不存在（新装 / 已迁移）时不做任何删除，只补审计标记。
 */
function rebuildLegacySessionsIfNeeded(db: Database.Database): void {
  if (!hasLegacyChapterColumn(db)) {
    markSessionsSchemaHandled(db)
    return
  }

  db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS ai_chat_messages')
    db.exec('DROP TABLE IF EXISTS ai_chat_sessions')
    markSessionsSchemaHandled(db)
  })()
}

export function createAiChatSchema(db: Database.Database): void {
  // 结构迁移必须先于建表：`CREATE TABLE IF NOT EXISTS` 对已存在的老表不会改结构。
  rebuildLegacySessionsIfNeeded(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      chapter_id INTEGER,
      role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'done',
      usage_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id) ON DELETE CASCADE
    )
  `)

  // 老库（无 `status` 列）幂等补列：`CREATE TABLE IF NOT EXISTS` 不会给已存在的表加列。
  // `NOT NULL DEFAULT 'done'` 让存量消息全部按「正常完成」解释，不做任何内容清洗。
  ensureColumn(db, 'ai_chat_messages', 'status', "TEXT NOT NULL DEFAULT 'done'")

  // 索引：按书取会话列表（最近活跃倒序）；按会话按 id 升序取消息。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_book
      ON ai_chat_sessions(book_id, updated_at DESC)
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_ai_chat_messages_session
      ON ai_chat_messages(session_id, id)
  `)
}

/** 检测表是否已有某列，缺失才 `ADD COLUMN`（幂等补列，不破坏既有数据；对齐 `schema/plot.ts`）。 */
function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (columns.some((item) => item.name === column)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
