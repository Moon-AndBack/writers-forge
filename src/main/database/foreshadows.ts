import type Database from 'better-sqlite3'
import { getDb } from './index'

/**
 * 伏笔域：数据访问实现，风格对齐 `plotLines.ts` / `plotScenes.ts`。
 *
 * 关键设计：
 * - **锚点存快照，不存 `paragraph_id`**：正文段落每次保存全删全插、id 全变；
 *   大纲正文是整条 JSON，没有段落行。故只存 `anchor_kind` + 章 / 大纲条目 id
 *   + `paragraph_idx` + `quote` + 段内字符区间，重定位与失效判定由后续批次完成；
 * - **埋设 / 回收双锚点**：`anchor_*` 记埋设点，`recover_*` 记回收点（回收时右键选中的
 *   那段正文），两者结构对称并共用同一套归一化 / 书域校验；
 * - **软删除**：`deleteForeshadow` 只置 `deleted_at`，查询一律过滤；
 * - 锚点目标（章 / 大纲条目）必须属于同一本书，写入前显式校验。
 */

/** 毫秒精度时间戳表达式，对齐 `plotShared.ts` / 大纲写入口径。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 伏笔状态：已埋下 / 已回收 / 已放弃。 */
export type ForeshadowStatus = 'planted' | 'recovered' | 'abandoned'

/** 锚点类型：章节段落 / 大纲条目 / 未锚定。 */
export type ForeshadowAnchorKind = 'chapter' | 'outline' | 'none'

/**
 * 锚点快照。`kind` 决定哪些字段有效：
 * - `chapter`：`chapterId` 必填，`paragraphIdx` / `charStart` / `charEnd` / `quote` 可选；
 * - `outline`：`outlineItemId` 必填，`quote` / 字符区间可选（大纲无段落序号）；
 * - `none`：其余字段全部清空。
 */
export interface ForeshadowAnchor {
  kind: ForeshadowAnchorKind
  chapterId?: number | null
  outlineItemId?: number | null
  paragraphIdx?: number | null
  quote?: string
  charStart?: number | null
  charEnd?: number | null
}

/**
 * 回收点锚点快照。结构与 {@link ForeshadowAnchor} 完全一致（`kind` 决定有效字段），
 * 独立命名以在调用处区分「埋设点」与「回收点」语义；校验 / 落库复用同一套逻辑。
 */
export type ForeshadowRecoverAnchor = ForeshadowAnchor

/** 伏笔行。`deletedAt` 非 null 表示已软删除。 */
export interface ForeshadowRow {
  id: number
  bookId: string
  title: string
  description: string
  /** 回收备注：回收时填写的说明，空串 = 无备注。 */
  recoveryNote: string
  status: ForeshadowStatus
  anchorKind: ForeshadowAnchorKind
  chapterId: number | null
  outlineItemId: number | null
  paragraphIdx: number | null
  quote: string
  charStart: number | null
  charEnd: number | null
  /** 回收点锚点类型；`'none'` = 尚未记录回收点。 */
  recoverAnchorKind: ForeshadowAnchorKind
  recoverChapterId: number | null
  recoverOutlineItemId: number | null
  recoverParagraphIdx: number | null
  /** 回收处原文摘录，空串 = 无。 */
  recoverQuote: string
  recoverCharStart: number | null
  recoverCharEnd: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 创建伏笔入参。`anchor` 缺省 = 未锚定（`kind: 'none'`）。 */
export interface ForeshadowCreatePayload {
  title: string
  description?: string
  status?: ForeshadowStatus
  anchor?: ForeshadowAnchor
}

/** 更新伏笔补丁：字段缺省保持不变；`anchor: null` = 清除锚点。 */
export interface ForeshadowUpdatePatch {
  title?: string
  description?: string
  /** 回收备注（回收伏笔时写入；空串 = 清空）。 */
  recoveryNote?: string
  status?: ForeshadowStatus
  anchor?: ForeshadowAnchor | null
  /** 回收点锚点（回收伏笔时写入）；`null` = 清除回收点。 */
  recoverAnchor?: ForeshadowRecoverAnchor | null
}

/** 伏笔列 SQL 片段（AS 别名对齐 `ForeshadowRow`）。 */
const FORESHADOW_COLUMNS =
  'id, book_id AS bookId, title, description, recovery_note AS recoveryNote, status, ' +
  'anchor_kind AS anchorKind, chapter_id AS chapterId, outline_item_id AS outlineItemId, ' +
  'paragraph_idx AS paragraphIdx, quote, char_start AS charStart, char_end AS charEnd, ' +
  'recover_anchor_kind AS recoverAnchorKind, recover_chapter_id AS recoverChapterId, ' +
  'recover_outline_item_id AS recoverOutlineItemId, ' +
  'recover_paragraph_idx AS recoverParagraphIdx, recover_quote AS recoverQuote, ' +
  'recover_char_start AS recoverCharStart, recover_char_end AS recoverCharEnd, ' +
  'created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'

const FORESHADOW_STATUSES: readonly string[] = ['planted', 'recovered', 'abandoned']

/** 归一化状态：非白名单值回退 `'planted'`（与写入侧校验双保险）。 */
function normalizeStatus(value: unknown): ForeshadowStatus {
  return typeof value === 'string' && FORESHADOW_STATUSES.includes(value)
    ? (value as ForeshadowStatus)
    : 'planted'
}

/** 正整数 id：非法回 null。 */
function toPositiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/** 可选非负整数（段落序号 / 字符偏移）：非法 / 负数回 null。 */
function toOptionalIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** 归一化后的锚点落库形状（埋设 / 回收点共用，列前缀由调用方拼接）。 */
interface NormalizedAnchor {
  kind: ForeshadowAnchorKind
  chapterId: number | null
  outlineItemId: number | null
  paragraphIdx: number | null
  quote: string
  charStart: number | null
  charEnd: number | null
}

/**
 * 归一化并校验锚点：目标章 / 大纲条目须存在且属于同一本书（外键之外的书域约束）。
 * 非法锚点抛错，由 IPC `runWrite` 记录并原样上抛。`label` 仅用于错误文案区分
 * 埋设点 / 回收点（校验逻辑完全一致）。
 */
function normalizeAnchor(
  db: Database.Database,
  bookId: string,
  anchor: ForeshadowAnchor | null | undefined,
  label = '埋设'
): NormalizedAnchor {
  const kind = anchor?.kind
  if (kind === 'chapter') {
    const chapterId = toPositiveInt(anchor?.chapterId)
    if (chapterId === null) {
      throw new Error(`foreshadow: ${label}章节锚点缺少合法 chapterId`)
    }
    const chapter = db
      .prepare('SELECT book_id AS bookId FROM chapters WHERE id = ?')
      .get(chapterId) as { bookId: string } | undefined
    if (!chapter || chapter.bookId !== bookId) {
      throw new Error(`foreshadow: ${label}章节不属于该书（chapterId=${chapterId}）`)
    }
    return {
      kind: 'chapter',
      chapterId,
      outlineItemId: null,
      paragraphIdx: toOptionalIndex(anchor?.paragraphIdx),
      quote: typeof anchor?.quote === 'string' ? anchor.quote : '',
      charStart: toOptionalIndex(anchor?.charStart),
      charEnd: toOptionalIndex(anchor?.charEnd)
    }
  }
  if (kind === 'outline') {
    const outlineItemId = toPositiveInt(anchor?.outlineItemId)
    if (outlineItemId === null) {
      throw new Error(`foreshadow: ${label}大纲锚点缺少合法 outlineItemId`)
    }
    const item = db
      .prepare('SELECT book_id AS bookId FROM outline_items WHERE id = ?')
      .get(outlineItemId) as { bookId: string } | undefined
    if (!item || item.bookId !== bookId) {
      throw new Error(`foreshadow: ${label}大纲条目不属于该书（outlineItemId=${outlineItemId}）`)
    }
    return {
      kind: 'outline',
      chapterId: null,
      outlineItemId,
      paragraphIdx: null,
      quote: typeof anchor?.quote === 'string' ? anchor.quote : '',
      charStart: toOptionalIndex(anchor?.charStart),
      charEnd: toOptionalIndex(anchor?.charEnd)
    }
  }
  return {
    kind: 'none',
    chapterId: null,
    outlineItemId: null,
    paragraphIdx: null,
    quote: '',
    charStart: null,
    charEnd: null
  }
}

/** 列出某书全部**未删除**伏笔，按 `updated_at DESC, id DESC`。 */
export function listForeshadows(bookId: string): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE book_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC, id DESC`
    )
    .all(bookId) as ForeshadowRow[]
}

/** 按 id 取单条**未删除**伏笔；不存在 / 已软删返回 null。 */
export function getForeshadow(id: number): ForeshadowRow | null {
  const row = getDb()
    .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ? AND deleted_at IS NULL`)
    .get(id) as ForeshadowRow | undefined
  return row ?? null
}

/** 创建伏笔：`title` 必填（去空白后非空），锚点可为空。 */
export function createForeshadow(bookId: string, payload: ForeshadowCreatePayload): ForeshadowRow {
  const db = getDb()
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  if (title === '') throw new Error('createForeshadow: title 不能为空')
  const anchor = normalizeAnchor(db, bookId, payload.anchor)
  const result = db
    .prepare(
      `INSERT INTO foreshadows
        (book_id, title, description, status, anchor_kind, chapter_id, outline_item_id,
         paragraph_idx, quote, char_start, char_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      bookId,
      title,
      typeof payload.description === 'string' ? payload.description : '',
      normalizeStatus(payload.status),
      anchor.kind,
      anchor.chapterId,
      anchor.outlineItemId,
      anchor.paragraphIdx,
      anchor.quote,
      anchor.charStart,
      anchor.charEnd
    )
  return db
    .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ForeshadowRow
}

/**
 * 生成锚点列的 SET 片段并压入参数：`prefix` 为空串 = 埋设锚点，`'recover_'` = 回收点。
 * 两套列集合完全对称，借此复用同一份归一化结果，避免复制校验逻辑（含书域校验）。
 */
function pushAnchorSets(
  sets: string[],
  values: unknown[],
  prefix: string,
  anchor: NormalizedAnchor
): void {
  sets.push(
    `${prefix}anchor_kind = ?`,
    `${prefix}chapter_id = ?`,
    `${prefix}outline_item_id = ?`,
    `${prefix}paragraph_idx = ?`,
    `${prefix}quote = ?`,
    `${prefix}char_start = ?`,
    `${prefix}char_end = ?`
  )
  values.push(
    anchor.kind,
    anchor.chapterId,
    anchor.outlineItemId,
    anchor.paragraphIdx,
    anchor.quote,
    anchor.charStart,
    anchor.charEnd
  )
}

/** 更新伏笔：仅覆盖提供的字段并刷新 `updated_at`；不存在 / 已软删返回 null。 */
export function updateForeshadow(id: number, patch: ForeshadowUpdatePatch): ForeshadowRow | null {
  const db = getDb()
  return db.transaction((): ForeshadowRow | null => {
    const existing = db
      .prepare('SELECT book_id AS bookId FROM foreshadows WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { bookId: string } | undefined
    if (!existing) return null

    const sets: string[] = []
    const values: unknown[] = []
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (title === '') throw new Error('updateForeshadow: title 不能为空')
      sets.push('title = ?')
      values.push(title)
    }
    if (patch.description !== undefined) {
      sets.push('description = ?')
      values.push(patch.description)
    }
    if (patch.recoveryNote !== undefined) {
      sets.push('recovery_note = ?')
      values.push(patch.recoveryNote)
    }
    if (patch.status !== undefined) {
      sets.push('status = ?')
      values.push(normalizeStatus(patch.status))
    }
    if (patch.anchor !== undefined) {
      pushAnchorSets(sets, values, '', normalizeAnchor(db, existing.bookId, patch.anchor))
    }
    if (patch.recoverAnchor !== undefined) {
      pushAnchorSets(
        sets,
        values,
        'recover_',
        normalizeAnchor(db, existing.bookId, patch.recoverAnchor, '回收点')
      )
    }
    if (sets.length > 0) {
      sets.push(`updated_at = ${NOW}`)
      db.prepare(`UPDATE foreshadows SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    }
    return db
      .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ?`)
      .get(id) as ForeshadowRow
  })()
}

/** 软删除伏笔：置 `deleted_at`，**不物理删除**；不存在 / 已软删返回 false。 */
export function deleteForeshadow(id: number): boolean {
  const db = getDb()
  const row = db.prepare('SELECT deleted_at AS deletedAt FROM foreshadows WHERE id = ?').get(id) as
    { deletedAt: string | null } | undefined
  if (!row || row.deletedAt !== null) return false
  db.prepare(`UPDATE foreshadows SET deleted_at = ${NOW} WHERE id = ?`).run(id)
  return true
}

/** 列出锚定在某章的**未删除**伏笔（供正文标记）：按段落序号、id 升序。 */
export function listForeshadowsByChapter(chapterId: number): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE chapter_id = ? AND anchor_kind = 'chapter' AND deleted_at IS NULL
       ORDER BY paragraph_idx, id`
    )
    .all(chapterId) as ForeshadowRow[]
}

/** 列出锚定在某大纲条目的**未删除**伏笔（供正文标记）：按 id 升序。 */
export function listForeshadowsByOutlineItem(outlineItemId: number): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE outline_item_id = ? AND anchor_kind = 'outline' AND deleted_at IS NULL
       ORDER BY id`
    )
    .all(outlineItemId) as ForeshadowRow[]
}

/**
 * 列出**回收点**锚定在某章的未删除伏笔（供正文「回收处」标记）：
 * 按回收段落序号、id 升序。`status` 不在此过滤，由调用方按业务决定是否展示。
 */
export function listForeshadowsByRecoverAnchorChapter(chapterId: number): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE recover_chapter_id = ? AND recover_anchor_kind = 'chapter' AND deleted_at IS NULL
       ORDER BY recover_paragraph_idx, id`
    )
    .all(chapterId) as ForeshadowRow[]
}

/**
 * 列出**回收点**锚定在某大纲条目的未删除伏笔（供正文「回收处」标记）：按 id 升序。
 * `status` 不在此过滤，由调用方按业务决定是否展示。
 */
export function listForeshadowsByRecoverAnchorOutlineItem(outlineItemId: number): ForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE recover_outline_item_id = ? AND recover_anchor_kind = 'outline'
         AND deleted_at IS NULL
       ORDER BY id`
    )
    .all(outlineItemId) as ForeshadowRow[]
}
