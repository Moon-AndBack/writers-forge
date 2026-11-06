import { getDb } from './index'

/**
 * AI 对话数据层（`ai_chat_sessions` / `ai_chat_messages`，见 `schema/aiChat.ts`）。
 *
 * 职责：
 * - 会话：按「书」列举（与章解耦）、创建、重命名、刷新活跃时间、删除（级联删消息）；
 * - 消息：按会话按 id 升序列举、追加（同一事务内刷新会话 `updated_at`）；
 *   每条消息用可空 `chapter_id` 记录「产生时所在的章」（纯标记，无外键），供回插校验。
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

/**
 * 消息收尾状态（DDL 默认 `done`，无 CHECK，由本层窄化兜底）。
 *
 * - `done`：正常完成（含用户主动停止 —— 停止是本地行为，内容仍是模型完整产出到此为止）；
 * - `interrupted`：上游报错中断，`content` 只是半截，界面另加结构化标记。
 */
export type AiMessageStatus = 'done' | 'interrupted'

/** 会话行（归属书，与章无关）。 */
export interface AiChatSessionRow {
  id: number
  bookId: string
  provider: string
  model: string
  title: string
  createdAt: string
  updatedAt: string
}

/**
 * 消息行。
 *
 * 回插（替换选中 / 插入到光标后）的允许条件：
 * `chapterId !== null && chapterId === 当前 chapterId`；
 * 即无章聊天产生的消息、以及来自其它章的消息都不允许回插。
 */
export interface AiChatMessageRow {
  id: number
  sessionId: number
  /** 消息产生时所在的章；无章聊天 / 历史空值为 `null`。无外键，删章不影响消息。 */
  chapterId: number | null
  role: AiChatRole
  content: string
  /** 收尾状态：`done`（默认）/ `interrupted`（上游报错中断）。 */
  status: AiMessageStatus
  /** 模型返回的 token 用量等原样 JSON 文本；无则 `null`。 */
  usageJson: string | null
  createdAt: string
}

/** 创建会话入参（归属书，与章无关；`title` 省略时落库为空串）。 */
export interface CreateAiSessionInput {
  bookId: string
  provider: string
  model: string
  title?: string
}

/**
 * 追加消息入参（`usageJson` / `status` 省略时分别落库为 `null` / `'done'`）。
 *
 * `chapterId` 记录消息产生时所在的章；无章聊天传 `null` / 省略。纯标记字段，
 * 不校验章是否存在，也不建立外键。
 */
export interface AppendAiMessageInput {
  sessionId: number
  chapterId?: number | null
  role: AiChatRole
  content: string
  status?: AiMessageStatus
  usageJson?: string | null
}

const SESSION_COLUMNS = `id, book_id AS bookId, provider, model,
  title, created_at AS createdAt, updated_at AS updatedAt`

const MESSAGE_COLUMNS = `id, session_id AS sessionId, chapter_id AS chapterId, role, content, status,
  usage_json AS usageJson, created_at AS createdAt`

/** 库内会话行形状（snake_case 已别名，仅列名映射）。 */
type SessionDbRow = AiChatSessionRow

/** 库内消息行形状（`role` / `status` 按字符串读入，再做窄化）。 */
interface MessageDbRow extends Omit<AiChatMessageRow, 'role' | 'status'> {
  role: string
  status: string
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

/** 脏数据兜底：未知角色按 `user`、未知状态按 `done` 处理（DDL 默认值保证正常值）。 */
function toAiMessageRow(row: MessageDbRow): AiChatMessageRow {
  return {
    id: row.id,
    sessionId: row.sessionId,
    chapterId: row.chapterId,
    role: row.role === 'system' || row.role === 'assistant' ? row.role : 'user',
    content: row.content,
    status: row.status === 'interrupted' ? 'interrupted' : 'done',
    usageJson: row.usageJson,
    createdAt: row.createdAt
  }
}

/** 列举某书下的全部会话（与章无关），按最近活跃倒序（同秒并列按 id 倒序，保证稳定）。 */
export function listAiSessions(bookId: string): AiChatSessionRow[] {
  return getDb()
    .prepare(
      `SELECT ${SESSION_COLUMNS} FROM ai_chat_sessions
       WHERE book_id = ?
       ORDER BY updated_at DESC, id DESC`
    )
    .all(bookId) as AiChatSessionRow[]
}

/** 新建会话（归属书，与章无关），返回落库后的行。 */
export function createAiSession(input: CreateAiSessionInput): AiChatSessionRow {
  const result = getDb()
    .prepare(
      `INSERT INTO ai_chat_sessions (book_id, provider, model, title)
       VALUES (@bookId, @provider, @model, @title)`
    )
    .run({
      bookId: input.bookId,
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
 * `status` 省略时落库为 `'done'`（正常完成）；`chapterId` 省略时落库为 `NULL`（无章聊天）。
 */
export function appendAiMessage(input: AppendAiMessageInput): AiChatMessageRow {
  const db = getDb()
  return db.transaction((): AiChatMessageRow => {
    const result = db
      .prepare(
        `INSERT INTO ai_chat_messages (session_id, chapter_id, role, content, status, usage_json)
         VALUES (@sessionId, @chapterId, @role, @content, @status, @usageJson)`
      )
      .run({
        sessionId: input.sessionId,
        chapterId: input.chapterId ?? null,
        role: input.role,
        content: input.content,
        status: input.status ?? 'done',
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
