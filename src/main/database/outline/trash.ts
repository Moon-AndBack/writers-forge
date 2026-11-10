import { getDb } from '../index'
import { coerceVolumeKind, toVolume } from '../chapterMappers'
import { VOLUME_COLUMNS } from '../chapterTypes'
import type { VolumeDbRow } from '../chapterTypes'
import { OUTLINE_ITEM_COLUMNS, toOutlineItem } from './types'
import type { DeletedOutlineContent, OutlineItemDbRow, OutlinePurgeCounts } from './types'
import {
  nextOutlineItemSortOrder,
  nextVolumeSortOrder,
  renumberOutlineItemsInGroup
} from './shared'

/**
 * 大纲域：回收站（查询 / 还原 / 彻底删除），自 `outline.ts` 拆出（对齐 `chapterTrash.ts`，§3）。
 *
 * 软删除语义：`deleted_at IS NOT NULL` 即在回收站。还原 = 置回 NULL 并重排 `sort_order`
 * 追加到组末尾；彻底删除 = 物理 `DELETE`（条目正文内联在 `outline_items`，随行删除，无关联文档）。
 *
 * 回收站只管理大纲可见卷（`normal` / `group`）；`custom` 自定义卷仅属章节页，不在此出现。
 * 卷列表同时包含**未删但下有软删条目**的收拢卷（仅作容器，不提供卷级操作）。
 */

/**
 * 回收站卷展示序：已删卷在前（可操作），未删收拢卷在后；段内分组容器置顶、
 * 正文卷次之，再按 `sort_order, id`。
 */
const TRASH_VOLUME_ORDER_SQL = `(deleted_at IS NULL), CASE kind WHEN 'group' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, sort_order, id`

/* ---------- 回收站：查询 ---------- */

/**
 * 列出某书回收站内容：回收站卷（含未删收拢卷）+ 软删条目。
 *
 * 卷查询覆盖 `normal` / `group` 两类：已软删卷（可还原 / 彻底删除）与未删但下有软删
 * `scope='entry'` 条目的卷（仅作收拢容器）。卷纲正文只对已软删卷批量取出其
 * `scope='volume'` 行（一次查询，避免逐卷 N+1）；未删收拢卷的 `contentJson` 恒为 `null`。
 *
 * 条目补原归属卷名与父卷状态（`volumeKind` / `volumeInTrash`），与章节域回收站行对齐。
 */
export function listDeletedOutline(bookId: string): DeletedOutlineContent {
  const db = getDb()
  const volumes = (
    db
      .prepare(
        `SELECT ${VOLUME_COLUMNS} FROM volumes
         WHERE book_id = ? AND kind IN ('normal', 'group')
           AND (
             deleted_at IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM outline_items oi
               WHERE oi.volume_id = volumes.id
                 AND oi.scope = 'entry'
                 AND oi.deleted_at IS NOT NULL
             )
           )
         ORDER BY ${TRASH_VOLUME_ORDER_SQL}`
      )
      .all(bookId) as VolumeDbRow[]
  ).map(toVolume)

  const deletedVolumeIds = volumes
    .filter((volume) => volume.deletedAt !== null)
    .map((volume) => volume.id)
  const volumeContent = new Map<number, string | null>()
  if (deletedVolumeIds.length > 0) {
    const placeholders = deletedVolumeIds.map(() => '?').join(', ')
    const rows = db
      .prepare(
        `SELECT volume_id AS volumeId, content_json AS contentJson
         FROM outline_items
         WHERE volume_id IN (${placeholders}) AND scope = 'volume' AND deleted_at IS NOT NULL`
      )
      .all(...deletedVolumeIds) as Array<{
      volumeId: number
      contentJson: string | null
    }>
    for (const row of rows) volumeContent.set(row.volumeId, row.contentJson)
  }

  type DeletedItemJoinRow = OutlineItemDbRow & {
    volumeTitle: string | null
    volumeKind: string | null
    volumeDeletedAt: string | null
  }
  const items = (
    db
      .prepare(
        `SELECT ${OUTLINE_ITEM_COLUMNS},
           (SELECT v.title FROM volumes v WHERE v.id = outline_items.volume_id) AS volumeTitle,
           (SELECT v.kind FROM volumes v WHERE v.id = outline_items.volume_id) AS volumeKind,
           (SELECT v.deleted_at FROM volumes v WHERE v.id = outline_items.volume_id) AS volumeDeletedAt
         FROM outline_items
         WHERE book_id = ? AND scope = 'entry' AND deleted_at IS NOT NULL
         ORDER BY (volume_id IS NULL) DESC, volume_id, sort_order, id`
      )
      .all(bookId) as DeletedItemJoinRow[]
  ).map((row) => ({
    ...toOutlineItem(row),
    volumeTitle: row.volumeTitle,
    // 卷缺失（被物理删除）保留 null 语义；仅对存在的卷归一化异常 kind。
    volumeKind: row.volumeKind === null ? null : coerceVolumeKind(row.volumeKind),
    volumeInTrash: row.volumeDeletedAt !== null
  }))

  return {
    volumes: volumes.map((volume) => ({
      ...volume,
      contentJson: volumeContent.get(volume.id) ?? null
    })),
    items
  }
}

/* ---------- 回收站：还原 ---------- */

/**
 * 还原卷：置回未删除、追加到**同 kind** 卷空间末尾，并还原其下软删条目（重排该卷分组）。
 * 其下 `scope='volume'` 卷纲行亦随之还原（卷纲排序恒 0，不参与条目重排）。
 */
export function restoreOutlineVolume(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare('SELECT book_id AS bookId, kind, deleted_at AS deletedAt FROM volumes WHERE id = ?')
      .get(id) as { bookId: string; kind: string; deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

    db.prepare('UPDATE volumes SET deleted_at = NULL, sort_order = ? WHERE id = ?').run(
      nextVolumeSortOrder(row.bookId, row.kind),
      id
    )
    db.prepare(
      'UPDATE outline_items SET deleted_at = NULL WHERE volume_id = ? AND deleted_at IS NOT NULL'
    ).run(id)
    renumberOutlineItemsInGroup(row.bookId, id)
    return true
  })()
}

/**
 * 还原条目：置回未删除、追加到目标组末尾（`MAX+1`）并重排该组。
 * 组 = 其当前 `volume_id`（null 即置顶独立区）。仅普通条目（`scope='entry'`）可还原；
 * 卷纲行随所属卷还原，不经此函数。
 *
 * 父卷守卫：挂卷条目要求父卷**存在、未软删且为大纲可见 kind**（`normal` / `group`）；
 * 父卷在回收站 / 已物理删除 / 为 `custom` 时返回 false（UI 禁用还原），避免产生挂在
 * 不可见卷下的幽灵条目。独立条目（`volume_id IS NULL`）无父卷，直接允许。
 */
export function restoreOutlineItem(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT oi.book_id AS bookId, oi.volume_id AS volumeId, oi.deleted_at AS deletedAt,
                v.id AS parentId, v.deleted_at AS parentDeletedAt, v.kind AS parentKind
         FROM outline_items oi LEFT JOIN volumes v ON v.id = oi.volume_id
         WHERE oi.id = ? AND oi.scope = 'entry'`
      )
      .get(id) as
      | {
          bookId: string
          volumeId: number | null
          deletedAt: string | null
          parentId: number | null
          parentDeletedAt: string | null
          parentKind: string | null
        }
      | undefined
    if (!row || row.deletedAt === null) return false

    if (row.volumeId !== null) {
      const parentUsable =
        row.parentId !== null &&
        row.parentDeletedAt === null &&
        (row.parentKind === 'normal' || row.parentKind === 'group')
      if (!parentUsable) return false
    }

    db.prepare('UPDATE outline_items SET deleted_at = NULL, sort_order = ? WHERE id = ?').run(
      nextOutlineItemSortOrder(row.bookId, row.volumeId),
      id
    )
    renumberOutlineItemsInGroup(row.bookId, row.volumeId)
    return true
  })()
}

/* ---------- 回收站：彻底删除 ---------- */

/**
 * 彻底删除卷：物理删其下全部大纲行（`kind='entry'` 条目与 `scope='volume'` 卷纲行，
 * 正文内联随行删除），再删卷。仅对回收站中的卷生效。
 */
export function purgeOutlineVolume(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db.prepare('SELECT deleted_at AS deletedAt FROM volumes WHERE id = ?').get(id) as
      { deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

    db.prepare('DELETE FROM outline_items WHERE volume_id = ?').run(id)
    db.prepare('DELETE FROM volumes WHERE id = ?').run(id)
    return true
  })()
}

/**
 * 彻底删除条目：物理删行并重排同组剩余未删条目。仅对回收站中的普通条目（`scope='entry'`）生效。
 */
export function purgeOutlineItem(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT book_id AS bookId, volume_id AS volumeId, deleted_at AS deletedAt
         FROM outline_items WHERE id = ? AND scope = 'entry'`
      )
      .get(id) as { bookId: string; volumeId: number | null; deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

    db.prepare('DELETE FROM outline_items WHERE id = ?').run(id)
    renumberOutlineItemsInGroup(row.bookId, row.volumeId)
    return true
  })()
}

/**
 * 清空某书大纲回收站：彻底删除软删的 `normal` / `group` 卷（含其下大纲行），
 * 再删除残留软删条目——仅限独立条目（`volume_id IS NULL`）或父卷为 `normal` / `group`
 * 的条目。`custom` 卷及其下条目属章节域，不在此清除。
 */
export function purgeAllDeletedOutline(bookId: string): OutlinePurgeCounts {
  const db = getDb()
  return db.transaction((): OutlinePurgeCounts => {
    const volumeIds = (
      db
        .prepare(
          `SELECT id FROM volumes
           WHERE book_id = ? AND kind IN ('normal', 'group') AND deleted_at IS NOT NULL`
        )
        .all(bookId) as Array<{ id: number }>
    ).map((item) => item.id)
    for (const volumeId of volumeIds) {
      db.prepare('DELETE FROM outline_items WHERE volume_id = ?').run(volumeId)
      db.prepare('DELETE FROM volumes WHERE id = ?').run(volumeId)
    }

    // 残留：不掉卷的独立条目，或其卷仍在的软删条目（挂软删卷的条目已随卷级联删除）。
    // 父卷为 custom / 已缺失的条目不属大纲回收站范围，保留待章节侧处理。
    const items = db
      .prepare(
        `SELECT oi.id FROM outline_items oi
         LEFT JOIN volumes v ON v.id = oi.volume_id
         WHERE oi.book_id = ? AND oi.scope = 'entry' AND oi.deleted_at IS NOT NULL
           AND (oi.volume_id IS NULL OR v.kind IN ('normal', 'group'))`
      )
      .all(bookId) as Array<{ id: number }>
    for (const item of items) {
      db.prepare('DELETE FROM outline_items WHERE id = ?').run(item.id)
    }
    return { volumes: volumeIds.length, items: items.length }
  })()
}
