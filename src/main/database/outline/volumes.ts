import Database from 'better-sqlite3'
import { getDb } from '../index'
import { createVolume, deleteVolume, renameVolume } from '../volumes'
import { assignVolumeNumberIndex } from '../chapterOrdering'
import { coerceVolumeKind, toVolume } from '../chapterMappers'
import { OUTLINE_VISIBLE_VOLUME_KINDS, VOLUME_COLUMNS } from '../chapterTypes'
import type { VolumeDbRow, VolumeRow } from '../chapterTypes'

/**
 * 大纲域：卷的查询与写入（自 `outline.ts` 拆出，保持单文件 ≤500 行，§3）。
 *
 * **统一卷池**：卷池为章节域 `volumes` 表。大纲页可见卷 = `kind IN ('normal','group')`
 * （正文卷 + 分组容器）；`custom`（自定义卷）仅章节页可见。**建卷 / 删卷 / 改名一律委托
 * 章节域实现**（§9 单一来源）——「建卷即建卷纲」的 `insertVolumeOutlineRow` 已在
 * `createVolume` 内原子完成，本模块**不重复实现**。
 *
 * 展示序：分组容器置顶（对齐章节页「自定义卷置顶」产品的分层直觉），其后为正文卷；
 * 各段内按 `sort_order, id`。`sort_order` 仅在 `(book_id, kind)` 内有意义，故重排按 kind 分段。
 */

/** 大纲页卷展示序：分组容器（`group`）置顶，其后正文卷（`normal`），段内 `sort_order, id`。 */
const OUTLINE_VOLUME_DISPLAY_ORDER_SQL = `CASE WHEN kind = 'group' THEN 0 ELSE 1 END, sort_order, id`

/** 大纲页可见卷 kind 的字面量 SQL 列表（内部常量，非外部输入）。 */
const VISIBLE_KINDS_SQL = OUTLINE_VISIBLE_VOLUME_KINDS.map((kind) => `'${kind}'`).join(', ')

/* ---------- 查询 ---------- */

/**
 * 列出某书全部**未删除**、大纲页可见的卷（`kind IN ('normal','group')`）。
 * 排序：分组容器置顶，正文卷在后，各段内按 `sortOrder, id`；返回时附动态 `numberIndex`
 * （仅 `normal` 卷编号 `1..n`，`group` 恒 0）。
 */
export function listOutlineVolumes(bookId: string): VolumeRow[] {
  const statement: Database.Statement<[string], VolumeDbRow> = getDb().prepare(
    `SELECT ${VOLUME_COLUMNS} FROM volumes
     WHERE book_id = ? AND deleted_at IS NULL AND kind IN (${VISIBLE_KINDS_SQL})
     ORDER BY ${OUTLINE_VOLUME_DISPLAY_ORDER_SQL}`
  )
  return assignVolumeNumberIndex(statement.all(bookId).map(toVolume))
}

/* ---------- 写入 ---------- */

/**
 * 创建**正文卷**（`kind='normal'`，追加到同 kind 卷空间末尾）：委托章节域 `createVolume`
 * ——其中「建卷即建卷纲」（同事务插 `scope='volume'` 卷纲行）已原子完成。
 * `name` 缺省 / 非字符串 → 走自动编号名（`nextVolumeDefaultTitle`，由 `createVolume` 决定）。
 *
 * 注：大纲页的「分组容器」由 `chapters.ts` 的 `createOutlineGroup`（`kind='group'`）创建，
 * 与本函数区分。
 */
export function createOutlineVolume(bookId: string, name?: string): VolumeRow {
  return createVolume(bookId, {
    kind: 'normal',
    title: typeof name === 'string' ? name : ''
  })
}

/** 重命名大纲卷：委托章节域 `renameVolume`（仅写 `title` 名段；不存在返回 null）。 */
export function renameOutlineVolume(id: number, name: string): VolumeRow | null {
  return renameVolume(id, name)
}

/**
 * 软删除卷：委托章节域 `deleteVolume`（同事务级联软删其下章节与**全部大纲行**：
 * `kind='entry'` 条目与 `scope='volume'` 卷纲行）。**仅限大纲页可见 kind**
 * （`normal` / `group`）——非可见卷（`custom`）不由大纲页删除。
 */
export function deleteOutlineVolume(id: number): boolean {
  const row = getDb()
    .prepare('SELECT kind FROM volumes WHERE id = ? AND deleted_at IS NULL')
    .get(id) as { kind: string } | undefined
  if (!row) return false
  if (!OUTLINE_VISIBLE_VOLUME_KINDS.includes(coerceVolumeKind(row.kind))) return false
  return deleteVolume(id)
}

/**
 * 将卷移动到**同 kind 段内**目标位置并重排 `sort_order`（0 起连续），越界自动收敛；
 * 不存在 / 非可见 kind 返回 false。
 *
 * `sort_order` 仅在 `(book_id, kind)` 内有意义，故只重排同 kind 子集：`group` 与 `normal`
 * 各自独立序号空间，拖拽不跨 kind（与章节页 `reorderVolume` 同口径）。
 */
export function reorderOutlineVolume(id: number, targetIndex: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare('SELECT book_id AS bookId, kind FROM volumes WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { bookId: string; kind: string } | undefined
    if (!row) return false
    if (!OUTLINE_VISIBLE_VOLUME_KINDS.includes(coerceVolumeKind(row.kind))) return false

    const ids = (
      db
        .prepare(
          'SELECT id FROM volumes WHERE book_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY sort_order, id'
        )
        .all(row.bookId, row.kind) as Array<{ id: number }>
    ).map((item) => item.id)

    const from = ids.indexOf(id)
    if (from === -1) return false
    ids.splice(from, 1)
    const to = Math.max(0, Math.min(Math.trunc(targetIndex), ids.length))
    ids.splice(to, 0, id)

    const update = db.prepare('UPDATE volumes SET sort_order = ? WHERE id = ?')
    for (let index = 0; index < ids.length; index += 1) update.run(index, ids[index])
    return true
  })()
}
