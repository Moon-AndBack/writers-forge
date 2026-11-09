import { getDb } from './index'
import { CHAPTER_SELECT, toChapter, type ChapterRow } from './chapters'
import { nextChapterSortOrder, nextVolumeSortOrder, renumberChaptersInGroup } from './chapterGroups'
import { ensureUnfiledVolume } from './volumes'
import { renumberOutlineItemsInGroup } from './outline/shared'
import type { ChapterDbRow } from './chapterTypes'

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
 * 回收站**不按卷 kind 过滤**——全部 kind 一视同仁可见可还原。
 *
 * 第三批起，**章节回收站只列章、不列卷**：软删卷只在大纲回收站管理。卷的还原 / 彻底删除
 * 函数（`restoreVolume` / `purgeVolume`）与 IPC 仍保留（大纲侧可能复用），但章节 UI 不再调用；
 * 章节回收站的「清空」也只物理删除软删章，不触碰卷与大纲条目。
 */

/** 回收站中的章行：原归属卷信息（供平铺列表与详情判断还原去向）。 */
export interface DeletedChapterRow extends ChapterRow {
  /** 原归属卷名段；卷缺失时为 null。 */
  volumeTitle: string | null
  /** 原归属卷是否也在回收站（软删）。 */
  volumeInTrash: boolean
  /** 原归属卷是否系统「未分卷」卷。 */
  volumeIsUnfiled: boolean
}

/** 章节回收站内容：仅被软删的章（已删除的卷只在大纲回收站管理）。 */
export interface DeletedContent {
  chapters: DeletedChapterRow[]
}

/** 清空章节回收站的清除计数。 */
export interface PurgeCounts {
  chapters: number
}

interface DeletedChapterJoinRow extends ChapterDbRow {
  volumeTitle: string | null
  volumeDeletedAt: string | null
  volumeIsUnfiled: number | null
}

/**
 * 列出某书章节回收站内容：软删的章（含原归属卷名与卷状态），
 * 按 `deleted_at DESC, id DESC`（最近删除优先，与伏笔 / 灵感回收站同口径）。
 */
export function listDeleted(bookId: string): DeletedContent {
  const chapters = (
    getDb()
      .prepare(
        `SELECT ${CHAPTER_SELECT},
           (SELECT v.title FROM volumes v WHERE v.id = chapters.volume_id) AS volumeTitle,
           (SELECT v.deleted_at FROM volumes v WHERE v.id = chapters.volume_id) AS volumeDeletedAt,
           (SELECT v.is_unfiled FROM volumes v WHERE v.id = chapters.volume_id) AS volumeIsUnfiled
         FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, id DESC`
      )
      .all(bookId) as DeletedChapterJoinRow[]
  ).map((row) => ({
    ...toChapter(row),
    volumeTitle: row.volumeTitle,
    volumeInTrash: row.volumeDeletedAt !== null,
    volumeIsUnfiled: row.volumeIsUnfiled === 1
  }))

  return { chapters }
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

/** 清空某书章节回收站：只物理删除全部软删章（段落随外键 CASCADE），不动软删卷与大纲条目。 */
export function purgeAllDeleted(bookId: string): PurgeCounts {
  const result = getDb()
    .prepare('DELETE FROM chapters WHERE book_id = ? AND deleted_at IS NOT NULL')
    .run(bookId)
  return { chapters: result.changes }
}
