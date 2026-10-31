import Database from 'better-sqlite3'
import { getDb } from '../index'
import { NOW } from '../chapterGroups'
import { createVolume } from '../volumes'
import { OUTLINE_ITEM_COLUMNS, OUTLINE_VISIBLE_VOLUME_KINDS, toOutlineItem } from './types'
import type { OutlineItemDbRow, OutlineItemRow } from './types'
import type { VolumeRow } from '../chapterTypes'
import { nextOutlineItemSortOrder, renumberOutlineItemsInGroup } from './shared'

/**
 * 大纲域：条目的查询与写入（自 `outline.ts` 拆出，保持单文件 ≤500 行，§3）。
 *
 * 数据模型（对齐 `schema/outlineItems.ts`）：
 * - **条目表 `outline_items`**（取代旧 `outline_chapters`）：无 `parent_id`、无
 *   `is_group`、无 `document_id`（正文内联在 `content_json`）；
 * - **分组 = `volumes.kind='group'` 的一行**（不是 `outline_items` 的行）：其下条目 =
 *   `volume_id = 分组 id AND kind='entry' AND scope='entry'`。故「挂到分组」与「挂到卷」
 *   在本层是**同一动作**（给 `volumeId`）；层级仅两层；
 * - `kind`：`standalone`（独立条目，`volumeId` 为 null，列表置顶）/ `entry`（卷下条目）；
 *   `scope` 恒 `'entry'`（卷纲行的建 / 读写归 `content.ts` / `volumes`，不在本模块）。
 *
 * 条目正文一律经 `content.ts` 的 `saveOutlineContent` 写入（新建条目行以空正文落库，
 * `content_json` = NULL）。
 */

/** 大纲页可用卷（正文卷 / 分组容器）；条目只能挂到这些卷下。 */
const VISIBLE_KINDS_SQL = OUTLINE_VISIBLE_VOLUME_KINDS.map((kind) => `'${kind}'`).join(', ')

/* ---------- 查询 ---------- */

/**
 * 列出某书全部**未删除条目**（`scope='entry'`），排序：
 *
 * `ORDER BY (volume_id IS NULL) DESC, volume_id, sort_order, id`
 *
 * 含义：置顶独立区（`volume_id IS NULL`）在前；其后按卷 / 分组 id 归拢，组内按 `sort_order, id`。
 * **归拢键天然是 `volume_id`** —— 分组即卷，无需旧实现的 correlated 子查询按 `parent_id` 归拢。
 * 卷纲行（`scope='volume'`）已被过滤，不进入条目列表。
 */
export function listOutlineItems(bookId: string): OutlineItemRow[] {
  const statement: Database.Statement<[string], OutlineItemDbRow> = getDb().prepare(
    `SELECT ${OUTLINE_ITEM_COLUMNS} FROM outline_items
     WHERE book_id = ? AND scope = 'entry' AND deleted_at IS NULL
     ORDER BY (volume_id IS NULL) DESC, volume_id, sort_order, id`
  )
  return statement.all(bookId).map(toOutlineItem)
}

/** 按 id 读回领域对象（供创建 / 重命名后返回）；不存在返回 undefined。 */
function readOutlineItem(id: number): OutlineItemRow | undefined {
  const row = getDb()
    .prepare(`SELECT ${OUTLINE_ITEM_COLUMNS} FROM outline_items WHERE id = ?`)
    .get(id) as OutlineItemDbRow | undefined
  return row ? toOutlineItem(row) : undefined
}

/* ---------- 写入 ---------- */

/**
 * 创建条目。`title` 缺省 / 非字符串 → 空串（纯自定义名，无编号）。
 * - `volumeId` 为数字 → **卷下 / 分组下条目**：目标须为该书未删除的**可见卷**
 *   （`kind IN ('normal','group')`，即正文卷或分组容器）；新条目 `kind='entry'`；
 * - `volumeId` 为 null → **独立条目（置顶）**，`kind='standalone'`、`scope='entry'`。
 *
 * 新条目以空正文落库（`content_json` = NULL、`text` = ''），正文由 `content.ts` 写入。
 */
export function createOutlineItem(
  bookId: string,
  volumeId: number | null,
  title?: string
): OutlineItemRow {
  const db = getDb()
  if (volumeId !== null) {
    const volume = db
      .prepare(
        `SELECT id FROM volumes
         WHERE id = ? AND book_id = ? AND deleted_at IS NULL AND kind IN (${VISIBLE_KINDS_SQL})`
      )
      .get(volumeId, bookId) as { id: number } | undefined
    if (!volume) throw new Error(`createOutlineItem: 目标卷不可用（volumeId=${volumeId}）`)
  }

  const finalTitle = typeof title === 'string' ? title : ''
  const kind = volumeId === null ? 'standalone' : 'entry'
  const createdId = db.transaction((): number => {
    const result = db
      .prepare(
        `INSERT INTO outline_items (book_id, volume_id, kind, scope, title, sort_order, text)
         VALUES (@bookId, @volumeId, @kind, 'entry', @title, @sortOrder, '')`
      )
      .run({
        bookId,
        volumeId,
        kind,
        title: finalTitle,
        sortOrder: nextOutlineItemSortOrder(bookId, volumeId)
      })
    return Number(result.lastInsertRowid)
  })()

  const created = readOutlineItem(createdId)
  if (!created) throw new Error(`createOutlineItem: 创建后读回失败（id=${createdId}）`)
  return created
}

/**
 * 创建**分组**：直接 INSERT 一行 `volumes.kind='group'`（委托章节域 `createVolume`，
 * 建卷即建卷纲的 `insertVolumeOutlineRow` 亦在其中——**分组卷同样带一条 `scope='volume'`
 * 卷纲行**，由 `idx_outline_items_volume_scope` 保证「每卷至多一条」）。分组**不产生任何
 * `outline_items` 的条目行**；其下条目由 `createOutlineItem(bookId, 分组id, title)` 挂入。
 *
 * 返回该分组卷行（`OutlineVolumeRow` = `VolumeRow`）。
 */
export function createOutlineGroup(bookId: string, title?: string): VolumeRow {
  return createVolume(bookId, {
    kind: 'group',
    title: typeof title === 'string' ? title : ''
  })
}

/**
 * 重命名条目：仅写 `title`（**不再同步任何 document 标题**——`documents` 表已删除，
 * 正文真源是 `outline_items.content_json`，与条目名无关）；不存在返回 null。
 */
export function renameOutlineItem(id: number, title: string): OutlineItemRow | null {
  const db = getDb()
  const result = db
    .prepare(`UPDATE outline_items SET title = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(title, id)
  if (Number(result.changes) === 0) return null
  return readOutlineItem(id) ?? null
}

/**
 * 软删除条目：置 `deleted_at`（不物理删除，便于回收站还原）；随后对同组剩余未删条目重排。
 * 仅普通条目（`scope='entry'`）可经此删除；卷纲行不由本函数处理。
 */
export function deleteOutlineItem(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT book_id AS bookId, volume_id AS volumeId, deleted_at AS deletedAt
         FROM outline_items WHERE id = ? AND scope = 'entry'`
      )
      .get(id) as { bookId: string; volumeId: number | null; deletedAt: string | null } | undefined
    if (!row || row.deletedAt !== null) return false
    db.prepare(`UPDATE outline_items SET deleted_at = ${NOW} WHERE id = ?`).run(id)
    renumberOutlineItemsInGroup(row.bookId, row.volumeId)
    return true
  })()
}

/* ---------- 组谓词（重排用） ---------- */

/**
 * 同组未删条目 id 序列（按 `sort_order, id`）：
 * - `volumeId` 非 null → 该卷 / 分组下的条目（`volume_id = ?`）；
 * - `volumeId` 为 null → 该书**置顶独立区**（`volume_id IS NULL`，按书隔离）。
 * 一律限定 `scope='entry'`（卷纲行不参与条目排序）。
 */
function listGroupItemIds(
  db: Database.Database,
  bookId: string,
  volumeId: number | null
): number[] {
  const groupPredicate = volumeId === null ? 'volume_id IS NULL' : 'volume_id = ?'
  const params: unknown[] = volumeId === null ? [bookId] : [bookId, volumeId]
  return (
    db
      .prepare(
        `SELECT id FROM outline_items
         WHERE book_id = ? AND ${groupPredicate} AND scope = 'entry' AND deleted_at IS NULL
         ORDER BY sort_order, id`
      )
      .all(...params) as Array<{ id: number }>
  ).map((item) => item.id)
}

/**
 * 将条目移动到**同组内**目标位置并重排 `sort_order`（0 起连续），越界自动收敛；不存在返回 false。
 * 组 = 其当前 `volume_id`（null 即置顶独立区）。跨组移动用 `moveOutlineItem`。
 */
export function reorderOutlineItem(id: number, targetIndex: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT book_id AS bookId, volume_id AS volumeId FROM outline_items
         WHERE id = ? AND scope = 'entry'`
      )
      .get(id) as { bookId: string; volumeId: number | null } | undefined
    if (!row) return false

    const ids = listGroupItemIds(db, row.bookId, row.volumeId)
    const from = ids.indexOf(id)
    if (from === -1) return false
    ids.splice(from, 1)
    const to = Math.max(0, Math.min(Math.trunc(targetIndex), ids.length))
    ids.splice(to, 0, id)

    const update = db.prepare(
      `UPDATE outline_items SET sort_order = ? WHERE id = ? AND scope = 'entry'`
    )
    for (let index = 0; index < ids.length; index += 1) update.run(index, ids[index])
    return true
  })()
}

/**
 * 将条目移动到指定卷末尾（目标须为同书未删除**可见卷**：正文卷 / 分组容器）；
 * 重排源 / 目标两组；不存在 / 目标非法返回 false。
 *
 * **统一挂载口径**：目标既可为正文卷，也可为分组容器——二者在本模型中都是 `volumes` 行，
 * 条目挂载一律写 `volume_id`（`kind` 恒 `'entry'`）。移入 / 移出分组即改 `volume_id`。
 */
export function moveOutlineItem(id: number, volumeId: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT book_id AS bookId, volume_id AS volumeId FROM outline_items
         WHERE id = ? AND scope = 'entry'`
      )
      .get(id) as { bookId: string; volumeId: number | null } | undefined
    if (!row) return false
    if (typeof volumeId !== 'number' || !Number.isInteger(volumeId) || volumeId <= 0) return false

    const target = db
      .prepare(
        `SELECT id FROM volumes
         WHERE id = ? AND book_id = ? AND deleted_at IS NULL AND kind IN (${VISIBLE_KINDS_SQL})`
      )
      .get(volumeId, row.bookId) as { id: number } | undefined
    if (!target) return false

    const order = nextOutlineItemSortOrder(row.bookId, target.id)
    // standalone → entry（挂卷）；entry → entry（换卷）。表级 CHECK 与 volume_id 一致性由 kind 同步满足。
    db.prepare(
      `UPDATE outline_items SET volume_id = @volumeId, kind = 'entry', sort_order = @order, updated_at = ${NOW}
       WHERE id = @id AND scope = 'entry'`
    ).run({ id, volumeId: target.id, order })
    if (row.volumeId !== target.id) renumberOutlineItemsInGroup(row.bookId, row.volumeId)
    return true
  })()
}
