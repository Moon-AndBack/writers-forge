import { getDb } from './index'
import { FORESHADOW_COLUMNS, type ForeshadowRow } from './foreshadows'

/**
 * 伏笔域**回收站**（软删除的伏笔）：查询、还原、彻底删除。
 *
 * 从 `foreshadows.ts` 拆出的原因： §3 单文件 ≤500 行（写路径已占 447 行）。
 * 软删除语义与 `chapterTrash.ts` 一致：`deleted_at IS NOT NULL` 即在回收站。
 *
 * 彻底删除是**物理删整行**：一条伏笔的正文埋点（`body_*`）、大纲埋点（`outline_*`）
 * 与回收点（`recover_*`）同在一行内，随行一并消失，语义与「删除章节 / 大纲条目时
 * 外键 CASCADE 整条删除伏笔」一致。伏笔没有关联表 / 被引用外键，相关实体是按描述与
 * 锚点摘抄**文本匹配**派生的，不落库，故 purge 无需额外清理。
 */

/** 毫秒精度时间戳表达式，对齐 `foreshadows.ts` / 章节域写入口径。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 回收站中的伏笔行（= {@link ForeshadowRow}，`deletedAt` 非 null）。 */
export type DeletedForeshadowRow = ForeshadowRow

/** 列出某书回收站中的伏笔（软删行），按 `deleted_at DESC, id DESC`（最近删除优先）。 */
export function listDeletedForeshadows(bookId: string): DeletedForeshadowRow[] {
  return getDb()
    .prepare(
      `SELECT ${FORESHADOW_COLUMNS} FROM foreshadows
       WHERE book_id = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC, id DESC`
    )
    .all(bookId) as ForeshadowRow[]
}

/**
 * 还原伏笔：仅对回收站中的行生效，清空 `deleted_at` 并刷新 `updated_at`
 * （列表按 `updated_at DESC` 排序，刚还原的行回到最前）；不存在 / 未删除返回 false。
 */
export function restoreForeshadow(id: number): boolean {
  const db = getDb()
  const row = db.prepare('SELECT deleted_at AS deletedAt FROM foreshadows WHERE id = ?').get(id) as
    { deletedAt: string | null } | undefined
  if (!row || row.deletedAt === null) return false
  db.prepare(`UPDATE foreshadows SET deleted_at = NULL, updated_at = ${NOW} WHERE id = ?`).run(id)
  return true
}

/**
 * 彻底删除伏笔（物理删）：仅对回收站中的行生效；双埋点 / 回收点随整行一并删除
 * （见文件头）。不存在 / 未删除返回 false。
 */
export function purgeForeshadow(id: number): boolean {
  return (
    getDb().prepare('DELETE FROM foreshadows WHERE id = ? AND deleted_at IS NOT NULL').run(id)
      .changes > 0
  )
}

/** 清空某书伏笔回收站：物理删除全部软删行，返回删除条数。 */
export function purgeAllDeletedForeshadows(bookId: string): number {
  return getDb()
    .prepare('DELETE FROM foreshadows WHERE book_id = ? AND deleted_at IS NOT NULL')
    .run(bookId).changes
}
