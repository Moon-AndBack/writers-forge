import { getDb } from '../index'
import { toVolume } from '../chapterMappers'
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
 * 回收站**不按卷 kind 过滤**——全部 kind（含 `custom`）一视同仁可见可还原。
 */

/** 回收站卷展示序：分组容器置顶，其后正文卷、自定义卷，段内 `sort_order, id`。 */
const TRASH_VOLUME_ORDER_SQL = `CASE kind WHEN 'group' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, sort_order, id`

/* ---------- 回收站：查询 ---------- */

/**
 * 列出某书回收站内容：软删的卷与条目（卷含卷纲正文，条目含原归属卷名段 `volumeTitle`）。
 *
 * 卷纲正文：一次批量取出全部软删卷的 `scope='volume'` 行，避免逐卷 N+1；
 * 卷纲行缺失（旧数据 / 异常）时该卷 `contentJson` 为 `null`。
 */
export function listDeletedOutline(bookId: string): DeletedOutlineContent {
  const db = getDb()
  const volumes = (
    db
      .prepare(
        `SELECT ${VOLUME_COLUMNS} FROM volumes
         WHERE book_id = ? AND deleted_at IS NOT NULL
         ORDER BY ${TRASH_VOLUME_ORDER_SQL}`
      )
      .all(bookId) as VolumeDbRow[]
  ).map(toVolume)

  const volumeContent = new Map<number, string | null>()
  if (volumes.length > 0) {
    const placeholders = volumes.map(() => '?').join(', ')
    const rows = db
      .prepare(
        `SELECT volume_id AS volumeId, content_json AS contentJson
         FROM outline_items
         WHERE volume_id IN (${placeholders}) AND scope = 'volume' AND deleted_at IS NOT NULL`
      )
      .all(...volumes.map((volume) => volume.id)) as Array<{
      volumeId: number
      contentJson: string | null
    }>
    for (const row of rows) volumeContent.set(row.volumeId, row.contentJson)
  }

  const items = (
    db
      .prepare(
        `SELECT ${OUTLINE_ITEM_COLUMNS},
           (SELECT v.title FROM volumes v WHERE v.id = outline_items.volume_id) AS volumeTitle
         FROM outline_items
         WHERE book_id = ? AND scope = 'entry' AND deleted_at IS NOT NULL
         ORDER BY (volume_id IS NULL) DESC, volume_id, sort_order, id`
      )
      .all(bookId) as Array<OutlineItemDbRow & { volumeTitle: string | null }>
  ).map((row) => ({ ...toOutlineItem(row), volumeTitle: row.volumeTitle }))

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
 */
export function restoreOutlineItem(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT book_id AS bookId, volume_id AS volumeId, deleted_at AS deletedAt
         FROM outline_items WHERE id = ? AND scope = 'entry'`
      )
      .get(id) as { bookId: string; volumeId: number | null; deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

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

/** 清空某书回收站：彻底删除全部软删卷（含其下大纲行）与残留软删条目。 */
export function purgeAllDeletedOutline(bookId: string): OutlinePurgeCounts {
  const db = getDb()
  return db.transaction((): OutlinePurgeCounts => {
    const volumeIds = (
      db
        .prepare('SELECT id FROM volumes WHERE book_id = ? AND deleted_at IS NOT NULL')
        .all(bookId) as Array<{ id: number }>
    ).map((item) => item.id)
    for (const volumeId of volumeIds) {
      db.prepare('DELETE FROM outline_items WHERE volume_id = ?').run(volumeId)
      db.prepare('DELETE FROM volumes WHERE id = ?').run(volumeId)
    }

    // 残留：不掉卷的独立条目，或其卷仍在的软删条目（挂软删卷的条目已随卷级联删除）。
    const items = db
      .prepare(
        "SELECT id FROM outline_items WHERE book_id = ? AND scope = 'entry' AND deleted_at IS NOT NULL"
      )
      .all(bookId) as Array<{ id: number }>
    for (const item of items) {
      db.prepare('DELETE FROM outline_items WHERE id = ?').run(item.id)
    }
    return { volumes: volumeIds.length, items: items.length }
  })()
}
