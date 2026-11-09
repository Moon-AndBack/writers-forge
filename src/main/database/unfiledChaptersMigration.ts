import { getDb } from './index'
import { NOW, nextChapterSortOrder, renumberChaptersInGroup } from './chapterGroups'
import { ensureUnfiledVolume } from './volumes'

/**
 * 幽灵活章升级修复（幂等）：把「自身未删除、父卷已软删或缺失」的章迁移到系统
 * 「未分卷」卷。
 *
 * 背景：旧版 `restoreChapter` 只把章置回未删除，不检查父卷是否仍在回收站——父卷软删时
 * 章会「活着但左栏不可见」。新模型下这类章统一落到每书的系统「未分卷」卷（`is_unfiled=1`），
 * 后续由用户手动拖拽分卷。
 *
 * 时序：须在 `createOutlineItemsSchema` 之后调用（`ensureUnfiledVolume` 需要插卷纲行）；
 * 建表阶段的 `ensureColumn` 已保证 `volumes.is_unfiled` 存在。
 *
 * **幂等**：判据是活章挂软删 / 缺失父卷；修复后父卷为活系统卷，再次执行不命中任何行。
 * 不写一次性 settings 键——即使首次执行中途失败，事务回滚后下次启动会重跑。
 */
export function migrateOrphanChaptersToUnfiled(): void {
  const db = getDb()
  const orphans = db
    .prepare(
      `SELECT c.id AS id, c.book_id AS bookId
       FROM chapters c
       LEFT JOIN volumes v ON v.book_id = c.book_id AND v.id = c.volume_id
       WHERE c.deleted_at IS NULL
         AND (v.id IS NULL OR v.deleted_at IS NOT NULL)
       ORDER BY c.book_id, c.id`
    )
    .all() as Array<{ id: number; bookId: string }>
  if (orphans.length === 0) return

  db.transaction((): void => {
    const byBook = new Map<string, number[]>()
    for (const orphan of orphans) {
      const list = byBook.get(orphan.bookId)
      if (list) list.push(orphan.id)
      else byBook.set(orphan.bookId, [orphan.id])
    }

    const move = db.prepare(
      `UPDATE chapters SET volume_id = @volumeId, sort_order = @sortOrder, updated_at = ${NOW}
       WHERE id = @id`
    )
    for (const [bookId, chapterIds] of byBook) {
      const volumeId = ensureUnfiledVolume(bookId)
      for (const id of chapterIds) {
        move.run({ id, volumeId, sortOrder: nextChapterSortOrder(bookId, volumeId) })
      }
      // 统一按 pin 段重排目标组，保证特殊章置顶 / 置底语义与 sort_order 自洽。
      renumberChaptersInGroup(bookId, volumeId)
    }
  })()
}
