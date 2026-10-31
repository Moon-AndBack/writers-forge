import { getDb } from './index'
import {
  CHAPTER_SELECT,
  VOLUME_SELECT,
  toChapter,
  toVolume,
  type ChapterRow,
  type VolumeRow
} from './chapters'
import {
  PIN_RANK_SQL,
  nextChapterSortOrder,
  nextVolumeSortOrder,
  renumberChaptersInGroup
} from './chapterGroups'
import { VOLUME_DISPLAY_ORDER_SQL } from './chapterOrdering'
import { renumberOutlineItemsInGroup } from './outline/shared'
import type { ChapterDbRow, VolumeDbRow } from './chapterTypes'

/**
 * 章节域**回收站**（软删除的卷 / 章）：查询、还原、彻底删除。
 *
 * 与 `chapters.ts` 的分工：
 * - `chapters.ts` 负责常规增删改查与软删除置位（`deleteVolume` / `deleteChapter`）；
 * - 本模块负责回收站视图（`listDeleted`）与还原 / 物理清除（`restore*` / `purge*`）。
 *
 * 软删除语义：`deleted_at IS NOT NULL` 即在回收站。还原 = 置回 NULL 并重排 sortOrder
 * 追加到分组末尾；彻底删除 = 物理 `DELETE`，**段落随外键 `ON DELETE CASCADE` 清理**
 * （`documents` 表已删除，故无任何关联文档需要手工删）。
 *
 * v2 说明：`volume_id` 非空（未分卷语义移除），回收站章的「原归属卷」即其当前
 * `volume_id` 指向的卷；还原保持原卷归属（卷仍在回收站时章还原后仍在该卷分组，
 * 展示层按卷的删除态归拢）。回收站**不按卷 kind 过滤**——全部 kind 一视同仁可见可还原。
 */

/** 回收站中的卷行（= `VolumeRow`，`deletedAt` 非 null）。 */
export type DeletedVolumeRow = VolumeRow

/** 回收站中的章行：`volumeTitle` 为其**原归属**卷名段（供渲染「某某卷下的某某章」）。 */
export interface DeletedChapterRow extends ChapterRow {
  volumeTitle: string | null
}

/** 回收站内容：被软删的卷与章。 */
export interface DeletedContent {
  volumes: DeletedVolumeRow[]
  chapters: DeletedChapterRow[]
}

/** 清空回收站的清除计数。 */
export interface PurgeCounts {
  volumes: number
  chapters: number
}

interface DeletedChapterJoinRow extends ChapterDbRow {
  volumeTitle: string | null
}

/** 列出某书回收站内容：软删的卷（按展示序，自定义卷置顶）与章（含原归属卷名段，组内按 pin 段序）。 */
export function listDeleted(bookId: string): DeletedContent {
  const db = getDb()
  const volumes = (
    db
      .prepare(
        `SELECT ${VOLUME_SELECT} FROM volumes WHERE book_id = ? AND deleted_at IS NOT NULL
         ORDER BY ${VOLUME_DISPLAY_ORDER_SQL}`
      )
      .all(bookId) as VolumeDbRow[]
  ).map(toVolume)

  const chapters = (
    db
      .prepare(
        `SELECT ${CHAPTER_SELECT},
           (SELECT v.title FROM volumes v WHERE v.id = chapters.volume_id) AS volumeTitle
         FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL
         ORDER BY volume_id, ${PIN_RANK_SQL}, sort_order, id`
      )
      .all(bookId) as DeletedChapterJoinRow[]
  ).map((row) => ({ ...toChapter(row), volumeTitle: row.volumeTitle }))

  return { volumes, chapters }
}

/**
 * 还原卷：置回未删除、追加到**同 kind** 卷空间末尾，并还原其下软删的章（重排该卷分组）。
 *
 * 与大纲域 `restoreOutlineVolume` 对齐：`volumes` 为两域**共用卷池**，故同事务一并还原
 * 挂本卷的软删大纲行（条目 + 卷纲行，`scope='volume'` 行随之置回 NULL），并重排该组条目
 * （复用 `renumberOutlineItemsInGroup`，§9 单一来源；卷纲排序恒 0，不参与条目重排）。
 */
export function restoreVolume(id: number): boolean {
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
      'UPDATE chapters SET deleted_at = NULL WHERE volume_id = ? AND deleted_at IS NOT NULL'
    ).run(id)
    db.prepare(
      'UPDATE outline_items SET deleted_at = NULL WHERE volume_id = ? AND deleted_at IS NOT NULL'
    ).run(id)
    renumberChaptersInGroup(row.bookId, id)
    renumberOutlineItemsInGroup(row.bookId, id)
    return true
  })()
}

/** 还原章：置回未删除、追加到所属卷末尾并重排（卷 = 其当前 `volume_id`）。 */
export function restoreChapter(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        'SELECT book_id AS bookId, volume_id AS volumeId, deleted_at AS deletedAt FROM chapters WHERE id = ?'
      )
      .get(id) as { bookId: string; volumeId: number; deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

    db.prepare('UPDATE chapters SET deleted_at = NULL, sort_order = ? WHERE id = ?').run(
      nextChapterSortOrder(row.bookId, row.volumeId),
      id
    )
    renumberChaptersInGroup(row.bookId, row.volumeId)
    return true
  })()
}

/**
 * 彻底删除卷：物理删其下所有章（段落随章外键 CASCADE）+ 挂本卷的大纲条目
 * （大纲域 `outline_items`：卷下条目与 `scope='volume'` 的卷纲行），再删卷。
 * 仅对回收站中的卷生效。
 */
export function purgeVolume(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db.prepare('SELECT deleted_at AS deletedAt FROM volumes WHERE id = ?').get(id) as
      { deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

    db.prepare('DELETE FROM outline_items WHERE volume_id = ?').run(id)
    db.prepare('DELETE FROM chapters WHERE volume_id = ?').run(id)
    db.prepare('DELETE FROM volumes WHERE id = ?').run(id)
    return true
  })()
}

/** 彻底删除章：物理删章（段落随外键 CASCADE 清理），并重排同组剩余未删除章。仅对回收站中的章生效。 */
export function purgeChapter(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        'SELECT book_id AS bookId, volume_id AS volumeId, deleted_at AS deletedAt FROM chapters WHERE id = ?'
      )
      .get(id) as { bookId: string; volumeId: number; deletedAt: string | null } | undefined
    if (!row || row.deletedAt === null) return false

    db.prepare('DELETE FROM chapters WHERE id = ?').run(id)
    renumberChaptersInGroup(row.bookId, row.volumeId)
    return true
  })()
}

/** 清空某书回收站：彻底删除全部软删卷（含其下章与挂卷大纲条目）与残留软删章。 */
export function purgeAllDeleted(bookId: string): PurgeCounts {
  const db = getDb()
  return db.transaction((): PurgeCounts => {
    const volumeIds = (
      db
        .prepare('SELECT id FROM volumes WHERE book_id = ? AND deleted_at IS NOT NULL')
        .all(bookId) as Array<{ id: number }>
    ).map((item) => item.id)
    for (const volumeId of volumeIds) {
      db.prepare('DELETE FROM outline_items WHERE volume_id = ?').run(volumeId)
      db.prepare('DELETE FROM chapters WHERE volume_id = ?').run(volumeId)
      db.prepare('DELETE FROM volumes WHERE id = ?').run(volumeId)
    }

    const chapters = db
      .prepare('SELECT id FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL')
      .all(bookId) as Array<{ id: number }>
    for (const chapter of chapters) {
      db.prepare('DELETE FROM chapters WHERE id = ?').run(chapter.id)
    }
    return { volumes: volumeIds.length, chapters: chapters.length }
  })()
}
