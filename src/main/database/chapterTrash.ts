import { getDb } from './index'
import { CHAPTER_SELECT, toChapter, type ChapterRow } from './chapters'
import { nextChapterSortOrder, nextVolumeSortOrder, renumberChaptersInGroup } from './chapterGroups'
import { ensureUnfiledVolume, withVolumeNumberIndex } from './volumes'
import { renumberOutlineItemsInGroup } from './outline/shared'
import { coerceVolumeKind, toVolume } from './chapterMappers'
import { VOLUME_COLUMNS } from './chapterTypes'
import type { ChapterDbRow, VolumeDbRow, VolumeKind, VolumeRow } from './chapterTypes'

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
 * v2 说明：`volume_id` 非空（用户可选「未分卷」已移除），回收站章的「原归属卷」即其当前
 * `volume_id` 指向的卷。还原章的目标卷：**原卷未删且非分组容器 → 原卷末尾**；否则
 * （父卷软删 / 缺失 / 分组容器异常数据）→ 系统「未分卷」卷末尾（`ensureUnfiledVolume` 兜底），
 * 避免活章挂在软删卷下成为左栏不可见的幽灵活章。
 * 回收站列**两类卷**：① 已软删的 `normal` / `custom` 卷（可还原 / 彻底删除）；
 * ② 未删但下有软删章的卷（仅作收拢容器，不可操作；正文卷补「卷X」动态编号）。
 * 章节回收站的卷详情**只展示元信息**，不返回卷纲正文（正文卷的卷纲在大纲模块编辑）。
 * 「清空」先物理删除 ① 类卷及其下章 / 大纲行，再删除其余软删章。
 */

/** 回收站中的章行：原归属卷信息（供平铺列表与详情判断还原去向）。 */
export interface DeletedChapterRow extends ChapterRow {
  /** 原归属卷名段；卷缺失时为 null。 */
  volumeTitle: string | null
  /** 原归属卷是否也在回收站（软删）。 */
  volumeInTrash: boolean
  /** 原归属卷是否系统「未分卷」卷。 */
  volumeIsUnfiled: boolean
  /** 原归属卷 kind；卷被物理删除导致子查询无结果时为 null。 */
  volumeKind: VolumeKind | null
}

/** 章节回收站内容：回收站卷 + 被软删的章。 */
export interface DeletedContent {
  /** 已软删的 `normal` / `custom` 卷，以及下有软删章的未删卷（收拢容器）。 */
  volumes: VolumeRow[]
  chapters: DeletedChapterRow[]
}

/** 清空章节回收站的清除计数（`chapters` 含随卷一并物理删除的章）。 */
export interface PurgeCounts {
  volumes: number
  chapters: number
}

interface DeletedChapterJoinRow extends ChapterDbRow {
  volumeTitle: string | null
  volumeDeletedAt: string | null
  volumeIsUnfiled: number | null
  volumeKind: string | null
}

/**
 * 列出某书章节回收站内容：软删的章（含原归属卷名与卷状态）+ 回收站卷。
 *
 * 卷查询覆盖两类：
 * - **已软删**的 `normal` / `custom` 卷（排除系统「未分卷」）——可还原 / 彻底删除；
 * - **未删但下有软删章**的卷——仅作收拢容器，UI 不提供卷级操作。
 *
 * 排序：已删卷在前（真正可操作的回收站项），未删收拢卷在后；段内自定义卷优先、
 * 正文卷次之、未分卷置底，再按 `sort_order, id`。未删正文卷补动态 `numberIndex`（「卷X」），
 * 已删卷编号恒 0。章按 `deleted_at DESC, id DESC`（最近删除优先，与伏笔 / 灵感回收站同口径）。
 */
export function listDeleted(bookId: string): DeletedContent {
  const db = getDb()
  const volumes = (
    db
      .prepare(
        `SELECT ${VOLUME_COLUMNS} FROM volumes
         WHERE book_id = ? AND kind IN ('normal', 'custom')
           AND (
             (deleted_at IS NOT NULL AND is_unfiled = 0)
             OR EXISTS (
               SELECT 1 FROM chapters c
               WHERE c.volume_id = volumes.id AND c.deleted_at IS NOT NULL
             )
           )
         ORDER BY (deleted_at IS NULL),
                  CASE WHEN is_unfiled = 1 THEN 2 WHEN kind = 'custom' THEN 0 ELSE 1 END,
                  sort_order, id`
      )
      .all(bookId) as VolumeDbRow[]
  )
    .map(toVolume)
    .map((volume) => (volume.deletedAt === null ? withVolumeNumberIndex(volume) : volume))

  const chapters = (
    db
      .prepare(
        `SELECT ${CHAPTER_SELECT},
           (SELECT v.title FROM volumes v WHERE v.id = chapters.volume_id) AS volumeTitle,
           (SELECT v.deleted_at FROM volumes v WHERE v.id = chapters.volume_id) AS volumeDeletedAt,
           (SELECT v.is_unfiled FROM volumes v WHERE v.id = chapters.volume_id) AS volumeIsUnfiled,
           (SELECT v.kind FROM volumes v WHERE v.id = chapters.volume_id) AS volumeKind
         FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, id DESC`
      )
      .all(bookId) as DeletedChapterJoinRow[]
  ).map((row) => ({
    ...toChapter(row),
    volumeTitle: row.volumeTitle,
    volumeInTrash: row.volumeDeletedAt !== null,
    volumeIsUnfiled: row.volumeIsUnfiled === 1,
    // 卷缺失（被物理删除）保留 null 语义；仅对存在的卷归一化异常 kind。
    volumeKind: row.volumeKind === null ? null : coerceVolumeKind(row.volumeKind)
  }))

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
      .prepare(
        'SELECT book_id AS bookId, kind, deleted_at AS deletedAt, is_unfiled AS isUnfiled FROM volumes WHERE id = ?'
      )
      .get(id) as
      { bookId: string; kind: string; deletedAt: string | null; isUnfiled: number } | undefined
    // 系统「未分卷」卷不经回收站流转（防御异常数据被还原到常规卷序）。
    if (!row || row.deletedAt === null || row.isUnfiled === 1) return false

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

/**
 * 还原章：置回未删除并追加到目标卷末尾，随后重排目标组（源组不同则一并重排）。
 *
 * 目标卷判定：
 * - 父卷存在、`deleted_at IS NULL` 且 `kind !== 'group'` → **原卷**；
 * - 否则（父卷软删 / 缺失 / 分组容器异常数据）→ 系统「未分卷」卷（幂等确保存在）。
 *
 * 「末尾」沿用 `nextChapterSortOrder` + `PIN_RANK_SQL` 语义：普通章落到普通段末尾，
 * 特殊章落到其 pin 段末尾（`top` / `bottom` / 无 pin 段），不破坏既有 pin 规则。
 */
export function restoreChapter(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        `SELECT c.book_id AS bookId, c.volume_id AS volumeId, c.deleted_at AS deletedAt,
                v.id AS parentId, v.deleted_at AS parentDeletedAt, v.kind AS parentKind
         FROM chapters c LEFT JOIN volumes v ON v.id = c.volume_id
         WHERE c.id = ?`
      )
      .get(id) as
      | {
          bookId: string
          volumeId: number
          deletedAt: string | null
          parentId: number | null
          parentDeletedAt: string | null
          parentKind: string | null
        }
      | undefined
    if (!row || row.deletedAt === null) return false

    const parentUsable =
      row.parentId !== null && row.parentDeletedAt === null && row.parentKind !== 'group'
    const targetVolumeId = parentUsable ? row.volumeId : ensureUnfiledVolume(row.bookId)

    db.prepare(
      `UPDATE chapters SET deleted_at = NULL, volume_id = ?, sort_order = ? WHERE id = ?`
    ).run(targetVolumeId, nextChapterSortOrder(row.bookId, targetVolumeId), id)
    renumberChaptersInGroup(row.bookId, targetVolumeId)
    // 源卷 !== 目标卷时重排源组，关闭旧活章留下的 sortOrder 空洞。
    if (row.volumeId !== targetVolumeId) renumberChaptersInGroup(row.bookId, row.volumeId)
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
    const row = db
      .prepare('SELECT deleted_at AS deletedAt, is_unfiled AS isUnfiled FROM volumes WHERE id = ?')
      .get(id) as { deletedAt: string | null; isUnfiled: number } | undefined
    // 系统「未分卷」卷不可物理删除（其下可能仍有活章 / 待还原章）。
    if (!row || row.deletedAt === null || row.isUnfiled === 1) return false

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

/**
 * 清空某书章节回收站：物理删除全部软删的 `normal` / `custom` 卷（其下章与大纲行一并删除）、
 * 再删除剩余软删章（段落随外键 CASCADE）。系统「未分卷」与未删卷不受影响；
 * 后者下的软删章按普通软删章清除。`chapters` 计数含随卷删除的章。
 */
export function purgeAllDeleted(bookId: string): PurgeCounts {
  const db = getDb()
  return db.transaction((): PurgeCounts => {
    const volumeIds = (
      db
        .prepare(
          `SELECT id FROM volumes
           WHERE book_id = ? AND kind IN ('normal', 'custom')
             AND is_unfiled = 0 AND deleted_at IS NOT NULL`
        )
        .all(bookId) as Array<{ id: number }>
    ).map((row) => row.id)

    let chapters = 0
    for (const volumeId of volumeIds) {
      db.prepare('DELETE FROM outline_items WHERE volume_id = ?').run(volumeId)
      chapters += db.prepare('DELETE FROM chapters WHERE volume_id = ?').run(volumeId).changes
      db.prepare('DELETE FROM volumes WHERE id = ?').run(volumeId)
    }

    chapters += db
      .prepare('DELETE FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL')
      .run(bookId).changes

    return { volumes: volumeIds.length, chapters }
  })()
}
