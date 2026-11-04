import { getDb } from './index'
import {
  BODY_COLUMNS,
  OUTLINE_COLUMNS,
  RECOVER_COLUMNS,
  normalizeAnchor,
  pushAnchorSets
} from './foreshadowsAnchor'

/**
 * 伏笔域：数据访问实现，风格对齐 `plotLines.ts` / `plotScenes.ts`。
 *
 * 关键设计：
 * - **锚点存快照，不存 `paragraph_id`**：正文段落每次保存全删全插、id 全变；
 *   大纲正文是整条 JSON，没有段落行。故只存锚点类型 + 目标 id + 段落序号
 *   （顶层块序号）+ 原文摘录 + 段内字符区间，重定位与失效判定由后续批次完成；
 * - **两个埋点槽位语义固定**（见 `schema/foreshadows.ts`）：`body_*` 只存章节锚点、
 *   `outline_*` 只存大纲条目锚点；落哪个槽位由入参 `kind` 唯一决定，跨类型会被
 *   CHECK 拒绝，故不再需要「一章 + 一大纲、禁同类型双埋」的组合校验；
 * - **回收点**：`recover_*` 仍为「章节 / 大纲条目 / 未记录」三态，与埋点共用同一套
 *   归一化 / 书域校验；
 * - **软删除**：`deleteForeshadow` 只置 `deleted_at`，查询一律过滤；
 * - 锚点目标（章 / 大纲条目）必须属于同一本书，写入前显式校验；
 * - **读路径已拆出**：列表 / 单条 / 锚点反查在 `foreshadowsQuery.ts`（§3 单文件 ≤500 行）。
 */

/** 毫秒精度时间戳表达式，对齐 `plotShared.ts` / 大纲写入口径。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 伏笔状态：已埋下 / 已回收 / 已放弃。 */
export type ForeshadowStatus = 'planted' | 'recovered' | 'abandoned'

/** 正文埋点类型：`body_*` 槽位只可能是章节段落 / 未埋设。 */
export type ForeshadowBodyKind = 'chapter' | 'none'

/** 大纲埋点类型：`outline_*` 槽位只可能是大纲条目 / 未埋设。 */
export type ForeshadowOutlineKind = 'outline' | 'none'

/** 锚点种类（回收点仍为「章节 / 大纲条目 / 未记录」三态）。 */
export type ForeshadowAnchorKind = 'chapter' | 'outline' | 'none'

/**
 * 锚点快照（判别联合）：**落哪个槽位由 `kind` 唯一决定**，不再有「主 / 第二」泛化。
 * - `chapter`：正文埋点，`chapterId` 必填，`paragraphIdx` / `quote` / 字符区间可选；
 *   **不含** `outlineItemId`（正文槽不存大纲条目）；
 * - `outline`：大纲埋点，`outlineItemId` 必填，`paragraphIdx`（大纲正文顶层块序号）/
 *   `quote` / 字符区间可选；**不含** `chapterId`（大纲槽不存章节）；
 * - `none`：清空对应槽位。
 */
export interface ForeshadowBodyAnchor {
  kind: 'chapter'
  chapterId: number
  paragraphIdx?: number | null
  quote?: string
  charStart?: number | null
  charEnd?: number | null
}

export interface ForeshadowOutlineAnchor {
  kind: 'outline'
  outlineItemId: number
  paragraphIdx?: number | null
  quote?: string
  charStart?: number | null
  charEnd?: number | null
}

export interface ForeshadowNoAnchor {
  kind: 'none'
}

/** 埋点锚点：正文槽 / 大纲槽 / 未埋设 三选一。 */
export type ForeshadowAnchor = ForeshadowBodyAnchor | ForeshadowOutlineAnchor | ForeshadowNoAnchor

/**
 * 回收点锚点快照。与埋点锚点同构（`kind` 决定有效字段），独立命名以在调用处区分
 * 「埋点」与「回收点」语义；校验 / 落库复用同一套逻辑。
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
  /** 正文埋点类型：`'chapter'` = 已埋在某章段落。 */
  bodyKind: ForeshadowBodyKind
  bodyChapterId: number | null
  bodyParagraphIdx: number | null
  /** 正文埋点原文摘录，空串 = 无。 */
  bodyQuote: string
  bodyCharStart: number | null
  bodyCharEnd: number | null
  /** 回收点锚点类型；`'none'` = 尚未记录回收点。 */
  recoverAnchorKind: ForeshadowAnchorKind
  recoverChapterId: number | null
  recoverOutlineItemId: number | null
  recoverParagraphIdx: number | null
  /** 回收处原文摘录，空串 = 无。 */
  recoverQuote: string
  recoverCharStart: number | null
  recoverCharEnd: number | null
  /** 大纲埋点类型：`'outline'` = 已埋在某大纲条目。 */
  outlineKind: ForeshadowOutlineKind
  outlineItemId: number | null
  outlineParagraphIdx: number | null
  /** 大纲埋点原文摘录，空串 = 无。 */
  outlineQuote: string
  outlineCharStart: number | null
  outlineCharEnd: number | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * 创建伏笔入参。属性名即槽位：`anchor` = **正文埋点**（`body_*`，仅章节锚点）、
 * `anchor2` = **大纲埋点**（`outline_*`，仅大纲条目锚点）；缺省 = 该槽位未埋设。
 * 属性名沿用 `anchor` / `anchor2` 以免本批把改动扩散到全部调用方（语义见字段注释）。
 */
export interface ForeshadowCreatePayload {
  title: string
  description?: string
  status?: ForeshadowStatus
  /** 正文埋点：只接受章节锚点（`kind: 'chapter'`）。 */
  anchor?: ForeshadowBodyAnchor | ForeshadowNoAnchor
  /** 大纲埋点：只接受大纲条目锚点（`kind: 'outline'`）。 */
  anchor2?: ForeshadowOutlineAnchor | ForeshadowNoAnchor
}

/** 更新伏笔补丁：字段缺省保持不变；`anchor: null` = 清除锚点。 */
export interface ForeshadowUpdatePatch {
  title?: string
  description?: string
  /** 回收备注（回收伏笔时写入；空串 = 清空）。 */
  recoveryNote?: string
  status?: ForeshadowStatus
  anchor?: ForeshadowBodyAnchor | ForeshadowNoAnchor | null
  /** 大纲埋点；`null` = 清除大纲埋点（`outline_*` 全清）。 */
  anchor2?: ForeshadowOutlineAnchor | ForeshadowNoAnchor | null
  /** 回收点锚点（回收伏笔时写入）；`null` = 清除回收点。 */
  recoverAnchor?: ForeshadowRecoverAnchor | null
}

/** 伏笔列 SQL 片段（AS 别名对齐 `ForeshadowRow`）；读路径模块 `foreshadowsQuery.ts` 复用。 */
export const FORESHADOW_COLUMNS =
  'id, book_id AS bookId, title, description, recovery_note AS recoveryNote, status, ' +
  'body_kind AS bodyKind, body_chapter_id AS bodyChapterId, ' +
  'body_paragraph_idx AS bodyParagraphIdx, body_quote AS bodyQuote, ' +
  'body_char_start AS bodyCharStart, body_char_end AS bodyCharEnd, ' +
  'outline_kind AS outlineKind, outline_item_id AS outlineItemId, ' +
  'outline_paragraph_idx AS outlineParagraphIdx, outline_quote AS outlineQuote, ' +
  'outline_char_start AS outlineCharStart, outline_char_end AS outlineCharEnd, ' +
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

/** 创建伏笔：`title` 必填（去空白后非空），两个埋点槽位均可为空。 */
export function createForeshadow(bookId: string, payload: ForeshadowCreatePayload): ForeshadowRow {
  const db = getDb()
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  if (title === '') throw new Error('createForeshadow: title 不能为空')
  // 属性名即槽位：`anchor` → 正文埋点，`anchor2` → 大纲埋点（类型已限定 kind）。
  const body = normalizeAnchor(db, bookId, payload.anchor, '正文埋点')
  const outline = normalizeAnchor(db, bookId, payload.anchor2, '大纲埋点')
  const result = db
    .prepare(
      `INSERT INTO foreshadows
        (book_id, title, description, status,
         body_kind, body_chapter_id, body_paragraph_idx, body_quote,
         body_char_start, body_char_end,
         outline_kind, outline_item_id, outline_paragraph_idx, outline_quote,
         outline_char_start, outline_char_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      bookId,
      title,
      typeof payload.description === 'string' ? payload.description : '',
      normalizeStatus(payload.status),
      body.kind,
      body.chapterId,
      body.paragraphIdx,
      body.quote,
      body.charStart,
      body.charEnd,
      outline.kind,
      outline.outlineItemId,
      outline.paragraphIdx,
      outline.quote,
      outline.charStart,
      outline.charEnd
    )
  return db
    .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ForeshadowRow
}

/** 更新伏笔：仅覆盖提供的字段并刷新 `updated_at`；不存在 / 已软删返回 null。 */
export function updateForeshadow(id: number, patch: ForeshadowUpdatePatch): ForeshadowRow | null {
  const db = getDb()
  return db.transaction((): ForeshadowRow | null => {
    const existing = db
      .prepare(
        `SELECT book_id AS bookId, body_kind AS bodyKind, outline_kind AS outlineKind
         FROM foreshadows WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as
      | { bookId: string; bodyKind: ForeshadowBodyKind; outlineKind: ForeshadowOutlineKind }
      | undefined
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
      pushAnchorSets(
        sets,
        values,
        BODY_COLUMNS,
        normalizeAnchor(db, existing.bookId, patch.anchor, '正文埋点')
      )
    }
    if (patch.anchor2 !== undefined) {
      pushAnchorSets(
        sets,
        values,
        OUTLINE_COLUMNS,
        normalizeAnchor(db, existing.bookId, patch.anchor2, '大纲埋点')
      )
    }
    if (patch.recoverAnchor !== undefined) {
      pushAnchorSets(
        sets,
        values,
        RECOVER_COLUMNS,
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

/** `attachForeshadowAnchor` 结果：失败原因区分满槽 / 入参非法 / 不存在。 */
export type AttachForeshadowAnchorResult =
  { ok: true; row: ForeshadowRow } | { ok: false; reason: 'full' | 'invalid' | 'notFound' }

/**
 * 给伏笔补上**缺失的埋点槽位**：槽位由锚点 `kind` 唯一决定，不再有「主槽优先」或
 * 「同类型冲突」判定——正文埋点只进 `body_*`、大纲埋点只进 `outline_*`。
 *
 * 规则：
 * - 目标须为 `chapter` / `outline`（`none` 由 IPC 消毒层拒为 `invalid`）；
 * - 目标槽位已被占用 → `full`（要换位置请走 `updateForeshadow` 覆盖）；
 * - 伏笔不存在 / 已软删 → `notFound`。
 *
 * 返回结构化结果而非抛错：满槽是**可预期的业务拒绝**（UI 据此提示）；
 * 目标章 / 大纲条目不属于该书的**入参非法**仍由 {@link normalizeAnchor} 抛错。
 */
export function attachForeshadowAnchor(
  id: number,
  anchor: ForeshadowBodyAnchor | ForeshadowOutlineAnchor
): AttachForeshadowAnchorResult {
  const db = getDb()
  return db.transaction((): AttachForeshadowAnchorResult => {
    const existing = db
      .prepare(
        `SELECT book_id AS bookId, body_kind AS bodyKind, outline_kind AS outlineKind
         FROM foreshadows WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as
      | { bookId: string; bodyKind: ForeshadowBodyKind; outlineKind: ForeshadowOutlineKind }
      | undefined
    if (!existing) return { ok: false, reason: 'notFound' }
    // kind → 槽位：章节锚点只能进正文槽，大纲锚点只能进大纲槽。
    const occupied =
      anchor.kind === 'chapter' ? existing.bodyKind !== 'none' : existing.outlineKind !== 'none'
    if (occupied) return { ok: false, reason: 'full' }
    const target = anchor.kind === 'chapter' ? BODY_COLUMNS : OUTLINE_COLUMNS
    const label = anchor.kind === 'chapter' ? '正文埋点' : '大纲埋点'
    const sets: string[] = []
    const values: unknown[] = []
    pushAnchorSets(sets, values, target, normalizeAnchor(db, existing.bookId, anchor, label))
    sets.push(`updated_at = ${NOW}`)
    db.prepare(`UPDATE foreshadows SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    const row = db
      .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ?`)
      .get(id) as ForeshadowRow
    return { ok: true, row }
  })()
}
