import { getDb } from './index'
import { derivePlainText, normalizeRichTextJson } from './richText'

/**
 * 灵感域：数据访问实现（字段设计见 `schema/inspirations.ts`）。
 *
 * 关键约定：
 * - **正文双列**：`content_json` 为富文本真源（整条块级 Tiptap JSON，NULL = 空正文 /
 *   尚未富文本化），`content` 为**派生纯文本摘要**（卡片摘要 / 搜索 / AI 上下文读它）；
 *   写侧两列恒同步：由 JSON 派生摘要，只给纯文本的旧调用方沿用旧路径（`content_json`
 *   置 NULL，避免摘要与真源分叉）；
 * - **标签存 JSON 数组字符串**：读侧统一经 {@link decodeTags} 反序列化，坏 JSON /
 *   非数组 / 非字符串项一律丢弃并回退空数组（防御历史脏数据与手改库）；
 *   写侧经 {@link normalizeInspirationTags} 去空白、去重、截断超长标签并限制数量；
 * - **按标签筛选走 SQLite JSON1**：`json_each()` 在内置 SQLite（3.38+）默认可用，
 *   无需额外索引即可在单书几百条量级内完成筛选；
 * - **物理删除**：`deleteInspiration` 直接删除整行（无回收站）；`deleted_at` 列仅作
 *   历史兼容保留，业务不再写入；
 * - **排序**：`updated_at DESC, id DESC`（最近编辑优先），写操作刷新 `updated_at`。
 */

/** 毫秒精度时间戳表达式，对齐 `plotShared.ts` / 伏笔写入口径。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 单条灵感最多保留的标签数（写入侧统一收敛）。 */
export const MAX_INSPIRATION_TAGS = 20

/** 单个标签最长字符数（写入侧统一截断）。 */
export const MAX_INSPIRATION_TAG_CHARS = 40

/** 灵感行（`tags` 已反序列化为字符串数组）。 */
export interface InspirationRow {
  id: number
  bookId: string
  title: string
  content: string
  /** 富文本真源（整条块级 Tiptap JSON）；`NULL` = 空正文 / 尚未富文本化。 */
  contentJson: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** 数据库原始行：`tags` 为 JSON 数组字符串。 */
interface InspirationDbRow extends Omit<InspirationRow, 'tags'> {
  tags: string
}

/** 列投影（AS 别名对齐 `InspirationRow`）。 */
export const INSPIRATION_COLUMNS =
  'id, book_id AS bookId, title, content, content_json AS contentJson, tags, ' +
  'created_at AS createdAt, updated_at AS updatedAt'

/** 创建灵感入参：全部可选（支持「先建空条目再补内容」的速记流程）。 */
export interface InspirationCreatePayload {
  title?: string
  content?: string
  contentJson?: string | null
  tags?: string[]
}

/** 更新灵感补丁：字段缺省保持不变（空补丁不刷新 `updated_at`）。 */
export interface InspirationUpdatePatch {
  title?: string
  content?: string
  contentJson?: string | null
  tags?: string[]
}

/**
 * 归一化标签列表：仅接受字符串，逐项去空白、截断到
 * {@link MAX_INSPIRATION_TAG_CHARS}、去重并最多保留 {@link MAX_INSPIRATION_TAGS} 个；
 * 空串 / 非字符串项直接丢弃。`unknown` 入参用于防御 IPC / 脏数据。
 */
export function normalizeInspirationTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().slice(0, MAX_INSPIRATION_TAG_CHARS)
    if (tag === '' || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
    if (tags.length >= MAX_INSPIRATION_TAGS) break
  }
  return tags
}

/** 反序列化 `tags` 列：坏 JSON / 非数组回退空数组（防御历史脏数据）。 */
function decodeTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    return normalizeInspirationTags(JSON.parse(raw))
  } catch {
    return []
  }
}

/** 原始行 → 领域行（反序列化标签）。 */
function mapRow(row: InspirationDbRow): InspirationRow {
  return { ...row, tags: decodeTags(row.tags) }
}

/** 按 id 取单条（供写路径回读）。 */
function selectInspiration(id: number): InspirationRow {
  const row = getDb()
    .prepare(`SELECT ${INSPIRATION_COLUMNS} FROM inspirations WHERE id = ?`)
    .get(id) as InspirationDbRow | undefined
  // 写路径刚插入 / 更新过，命中行必然存在；缺失说明库被外部改写，显式报错而非静默返回空行。
  if (!row) throw new Error(`selectInspiration: 灵感不存在（id=${id}）`)
  return mapRow(row)
}

/**
 * 列出某书全部灵感，按 `updated_at DESC, id DESC`。
 * `tag` 非空时只返回带该标签的条目（JSON1 `json_each` 精确匹配，调用前已 trim）。
 */
export function listInspirations(bookId: string, tag?: string): InspirationRow[] {
  const db = getDb()
  const filter = typeof tag === 'string' ? tag.trim() : ''
  const rows = (
    filter === ''
      ? db
          .prepare(
            `SELECT ${INSPIRATION_COLUMNS} FROM inspirations
             WHERE book_id = ?
             ORDER BY updated_at DESC, id DESC`
          )
          .all(bookId)
      : db
          .prepare(
            `SELECT ${INSPIRATION_COLUMNS} FROM inspirations
             WHERE book_id = ?
               AND EXISTS (
                 SELECT 1
                 FROM json_each(
                   CASE WHEN json_valid(inspirations.tags) THEN inspirations.tags ELSE '[]' END
                 ) AS je
                 WHERE je.value = ?
               )
             ORDER BY updated_at DESC, id DESC`
          )
          .all(bookId, filter)
  ) as InspirationDbRow[]
  return rows.map(mapRow)
}

/**
 * 列出某书全部灵感用到的去重标签（供筛选下拉）：
 * 按名称不区分大小写升序；空标签已在写入侧被过滤，此处再兜底剔除。
 */
export function listInspirationTags(bookId: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT je.value AS tag
       FROM inspirations,
            json_each(
              CASE WHEN json_valid(inspirations.tags) THEN inspirations.tags ELSE '[]' END
            ) AS je
       WHERE inspirations.book_id = ?
         AND je.value <> ''
       ORDER BY tag COLLATE NOCASE, tag`
    )
    .all(bookId) as Array<{ tag: unknown }>
  return rows
    .map((row) => row.tag)
    .filter((tag): tag is string => typeof tag === 'string' && tag !== '')
}

/** 创建灵感：`bookId` 须为已存在的书（外键约束保证）；返回新行。 */
export function createInspiration(
  bookId: string,
  payload: InspirationCreatePayload = {}
): InspirationRow {
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  // 正文双列：`content_json` 为富文本真源、`content` 为派生纯文本摘要。仅在调用方显式
  // 提供 JSON 时同步派生（JSON 优先，同传的纯文本被忽略）；只给纯文本（旧接口 / 教学种子）
  // 时保持旧行为：`content_json` 留 NULL，读侧以纯文本兜底。
  let contentJson: string | null = null
  let content = typeof payload.content === 'string' ? payload.content : ''
  if (payload.contentJson !== undefined) {
    contentJson = normalizeRichTextJson(payload.contentJson)
    content = contentJson === null ? '' : derivePlainText(contentJson)
  }
  const tags = normalizeInspirationTags(payload.tags)
  const result = getDb()
    .prepare(
      'INSERT INTO inspirations (book_id, title, content, content_json, tags) VALUES (?, ?, ?, ?, ?)'
    )
    .run(bookId, title, content, contentJson, JSON.stringify(tags))
  return selectInspiration(Number(result.lastInsertRowid))
}

/** 更新灵感：仅覆盖提供的字段，并刷新 `updated_at`；不存在返回 null。 */
export function updateInspiration(
  id: number,
  patch: InspirationUpdatePatch
): InspirationRow | null {
  const db = getDb()
  return db.transaction((): InspirationRow | null => {
    const existing = db.prepare('SELECT id FROM inspirations WHERE id = ?').get(id)
    if (!existing) return null

    const sets: string[] = []
    const values: unknown[] = []
    if (patch.title !== undefined) {
      sets.push('title = ?')
      values.push(patch.title.trim())
    }
    if (patch.contentJson !== undefined) {
      // 富文本路径：两列恒同步（JSON 为真源，摘要由 JSON 派生，块级以 `\n` 分隔）。
      const contentJson = normalizeRichTextJson(patch.contentJson)
      sets.push('content_json = ?', 'content = ?')
      values.push(contentJson, contentJson === null ? '' : derivePlainText(contentJson))
    } else if (patch.content !== undefined) {
      // 纯文本路径（旧接口）：只写摘要列，旧富文本真源置 NULL——`content` 已被整体替换，
      // 保留旧 JSON 会让摘要与真源分叉（本批渲染层仍只发纯文本）。
      sets.push('content = ?', 'content_json = NULL')
      values.push(patch.content)
    }
    if (patch.tags !== undefined) {
      sets.push('tags = ?')
      values.push(JSON.stringify(normalizeInspirationTags(patch.tags)))
    }
    if (sets.length > 0) {
      sets.push(`updated_at = ${NOW}`)
      db.prepare(`UPDATE inspirations SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    }
    return selectInspiration(id)
  })()
}

/**
 * 永久删除灵感（物理删）：不存在返回 false。
 * `inspirations` 无关联表 / 被引用外键，删除本行即完成。
 */
export function deleteInspiration(id: number): boolean {
  const result = getDb().prepare('DELETE FROM inspirations WHERE id = ?').run(id)
  return result.changes > 0
}
