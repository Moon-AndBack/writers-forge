import { getDb } from './index'

/**
 * AI 对话数据层（`ai_chat_sessions` / `ai_chat_messages`，见 `schema/aiChat.ts`）。
 *
 * 职责：
 * - 会话：按「书 + 章」列举、创建、重命名、刷新活跃时间、删除（级联删消息）；
 * - 消息：按会话按 id 升序列举、追加（同一事务内刷新会话 `updated_at`）。
 *
 * 约定：
 * - 全部同步（better-sqlite3）；
 * - **不做业务校验**（provider / model 白名单、角色合法性等留给 IPC 层），
 *   本层只依赖 SQL CHECK 与外键兜底；
 * - 写操作失败即抛错（外键 / CHECK 违例由 SQLite 抛出），读操作未命中返回空数组 / `null`；
 * - 时间列统一 `datetime('now')`（UTC，秒级），与各域既有默认值同口径。
 */

/** 消息角色（与 DDL 的 CHECK 一致）。 */
export type AiChatRole = 'system' | 'user' | 'assistant'

/** 会话行。 */
export interface AiChatSessionRow {
  id: number
  bookId: string
  chapterId: number
  provider: string
  model: string
  title: string
  createdAt: string
  updatedAt: string
}

/** 消息行。 */
export interface AiChatMessageRow {
  id: number
  sessionId: number
  role: AiChatRole
  content: string
  /** 模型返回的 token 用量等原样 JSON 文本；无则 `null`。 */
  usageJson: string | null
  createdAt: string
}

/** 创建会话入参（`title` 省略时落库为空串）。 */
export interface CreateAiSessionInput {
  bookId: string
  chapterId: number
  provider: string
  model: string
  title?: string
}

/** 追加消息入参（`usageJson` 省略时落库为 `null`）。 */
export interface AppendAiMessageInput {
  sessionId: number
  role: AiChatRole
  content: string
  usageJson?: string | null
}

const SESSION_COLUMNS = `id, book_id AS bookId, chapter_id AS chapterId, provider, model,
  title, created_at AS createdAt, updated_at AS updatedAt`

const MESSAGE_COLUMNS = `id, session_id AS sessionId, role, content,
  usage_json AS usageJson, created_at AS createdAt`

/** 库内会话行形状（snake_case 已别名，仅列名映射）。 */
type SessionDbRow = AiChatSessionRow

/** 库内消息行形状（`role` 按字符串读入，再做窄化）。 */
interface MessageDbRow extends Omit<AiChatMessageRow, 'role'> {
  role: string
}

/** 读取单个会话，不存在返回 `null`（仅供写后回读）。 */
function readAiSession(id: number): AiChatSessionRow | null {
  const row = getDb()
    .prepare(`SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions WHERE id = ?`)
    .get(id) as SessionDbRow | undefined
  return row ?? null
}

/** 读取单条消息，不存在返回 `null`（仅供写后回读）。 */
function readAiMessage(id: number): AiChatMessageRow | null {
  const row = getDb()
    .prepare(`SELECT ${MESSAGE_COLUMNS} FROM ai_chat_messages WHERE id = ?`)
    .get(id) as MessageDbRow | undefined
  return row ? toAiMessageRow(row) : null
}

/** 脏数据兜底：未知角色按 `user` 处理（DDL CHECK 保证正常值）。 */
function toAiMessageRow(row: MessageDbRow): AiChatMessageRow {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role === 'system' || row.role === 'assistant' ? row.role : 'user',
    content: row.content,
    usageJson: row.usageJson,
    createdAt: row.createdAt
  }
}

/** 列举某书某章下的会话，按最近活跃倒序（同秒并列按 id 倒序，保证稳定）。 */
export function listAiSessions(bookId: string, chapterId: number): AiChatSessionRow[] {
  return getDb()
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions
       WHERE book_id = ? AND chapter_id = ?
       ORDER BY updated_at DESC, id DESC`
    )
    .all(bookId, chapterId) as AiChatSessionRow[]
}

/** 新建会话，返回落库后的行。 */
export function createAiSession(input: CreateAiSessionInput): AiChatSessionRow {
  const result = getDb()
    .prepare(
      `INSERT INTO ai_chat_sessions (book_id, chapter_id, provider, model, title)
       VALUES (@bookId, @chapterId, @provider, @model, @title)`
    )
    .run({
      bookId: input.bookId,
      chapterId: input.chapterId,
      provider: input.provider,
      model: input.model,
      title: input.title ?? ''
    })

  const created = readAiSession(Number(result.lastInsertRowid))
  if (!created) throw new Error('createAiSession: 写入后回读失败')
  return created
}

/** 物理删除会话（消息由外键级联删除），返回是否命中。 */
export function deleteAiSession(id: number): boolean {
  const result = getDb().prepare('DELETE FROM ai_chat_sessions WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

/** 列举某会话的全部消息，按 id 升序（即写入先后）。 */
export function listAiMessages(sessionId: number): AiChatMessageRow[] {
  const rows = getDb()
    .prepare(
      `SELECT ${MESSAGE_COLUMNS} FROM ai_chat_messages
       WHERE session_id = ? ORDER BY id ASC`
    )
    .all(sessionId) as MessageDbRow[]
  return rows.map(toAiMessageRow)
}

/**
 * 追加一条消息并刷新所属会话的 `updated_at`（同一事务），返回落库后的消息行。
 * 会话不存在时由 `session_id` 外键拒绝（`foreign_keys = ON`），抛错且不落库。
 */
export function appendAiMessage(input: AppendAiMessageInput): AiChatMessageRow {
  const db = getDb()
  return db.transaction((): AiChatMessageRow => {
    const result = db
      .prepare(
        `INSERT INTO ai_chat_messages (session_id, role, content, usage_json)
         VALUES (@sessionId, @role, @content, @usageJson)`
      )
      .run({
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        usageJson: input.usageJson ?? null
      })

    db.prepare("UPDATE ai_chat_sessions SET updated_at = datetime('now') WHERE id = ?").run(
      input.sessionId
    )

    const created = readAiMessage(Number(result.lastInsertRowid))
    if (!created) throw new Error('appendAiMessage: 写入后回读失败')
    return created
  })()
}

/** 刷新会话活跃时间（供流式结束后调用），返回是否命中。 */
export function touchAiSession(id: number): boolean {
  const result = getDb()
    .prepare("UPDATE ai_chat_sessions SET updated_at = datetime('now') WHERE id = ?")
    .run(id)
  return Number(result.changes) > 0
}

/** 重命名会话并刷新活跃时间，返回是否命中（不存在返回 `false`）。 */
export function renameAiSession(id: number, title: string): boolean {
  const result = getDb()
    .prepare("UPDATE ai_chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?")
    .run(title, id)
  return Number(result.changes) > 0
}
