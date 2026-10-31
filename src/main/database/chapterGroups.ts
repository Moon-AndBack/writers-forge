import { getDb } from './index'
import { renumberInGroup } from './ordering'

/**
 * 卷 / 章排序分组共享工具（供 `chapters.ts`、`volumes.ts`、`chapterReorder.ts`、
 * `chapterTrash.ts` 复用）。
 *
 * 抽出原因：软删除（回收站）还原时需要「追加到目标分组末尾 + 重排 sortOrder」，
 * 与常规创建 / 移动共用同一套分组计数与重排逻辑，避免两处实现漂移。
 *
 * **序号空间分离**（对齐 `schema/chapters.ts`）：
 * - 卷的 `sort_order` 仅在 `(book_id, kind)` 内有意义 → `nextVolumeSortOrder` **必须带 kind 参数**，
 *   三个 kind 各自独立连续；
 * - 章 / 条目的 `sort_order` 在 `volume_id` 内有意义（含回收站行），故取下一序时**不过滤软删**，
 *   避免与待还原行撞序号。
 */

/** 毫秒精度时间戳表达式，对齐 `books.ts` / `entities.ts` 写法。 */
export const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/**
 * 指定 kind 的下一个卷 sortOrder。该 kind 下的**全部**卷（含回收站中的卷）参与取最大序，
 * 避免与已存在 / 待还原的 `sort_order` 冲突。
 */
export function nextVolumeSortOrder(bookId: string, kind: string): number {
  const row = getDb()
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM volumes WHERE book_id = ? AND kind = ?'
    )
    .get(bookId, kind) as { next: number }
  return row.next
}

/**
 * 指定卷分组的下一个章 sortOrder。统计**全部**章（含回收站中的章），
 * 新章追加到既有最大序之后，避免与待还原章冲突。
 */
export function nextChapterSortOrder(bookId: string, volumeId: number): number {
  const row = getDb()
    .prepare(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM chapters WHERE book_id = ? AND volume_id = ?'
    )
    .get(bookId, volumeId) as { next: number }
  return row.next
}

/**
 * 组内 pin 段排序键（SQL 表达式）：`pin='top'` 特殊章(0) → 普通章(1) →
 * 无 pin 特殊章(2) → `pin='bottom'`(3)。判别列由旧 `is_special = 0` 改为 `kind = 'normal'`。
 * 供各查询的 `ORDER BY` 复用，避免漂移。
 */
export const PIN_RANK_SQL = `CASE WHEN pin = 'top' THEN 0
   WHEN kind = 'normal' THEN 1
   WHEN pin IS NULL THEN 2
   ELSE 3 END`

/**
 * 对某书某卷分组按当前**展示顺序**重写 sortOrder（0 起连续）；仅作用于未删除章。
 * 排序键与 `listChapters` 组内一致（pin 段：`top` → 普通 → 无 pin → `bottom`，
 * 段内 `sort_order, id`），保证重排后 pin 段与 `sort_order` 自洽。
 *
 * 委托通用 `ordering.renumberInGroup`（§9）：组谓词 = `book_id + volume_id`，
 * 领域排序键前缀 = `PIN_RANK_SQL`，只含未删行、写 0 起连续。
 */
export function renumberChaptersInGroup(bookId: string, volumeId: number): void {
  renumberInGroup({
    table: 'chapters',
    bookId,
    volumeId,
    leadOrderSql: PIN_RANK_SQL
  })
}
