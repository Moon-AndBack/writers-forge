import { nextSortOrderInGroup, renumberInGroup } from '../ordering'
import { nextVolumeSortOrder } from '../chapterGroups'

/**
 * 大纲域排序辅助：条目「下一序」与组内重排，以及卷序的委托入口。
 *
 * 组划分（对齐 `schema/outlineItems.ts`）：
 * - **卷下条目 / 分组下条目**（`volume_id` 非空）：组 = 该卷 / 分组，扁平，`scope='entry'`；
 * - **置顶独立区**（`volume_id IS NULL`）：`kind='standalone'` 条目共用一个**按书隔离**的
 *   排序空间（组谓词 `book_id = ? AND volume_id IS NULL`）。
 *
 * 卷序（`volumes.sort_order`）**仅在 `(book_id, kind)` 内有意义**，其取序实现属章节域，
 * 此处仅转发 `nextVolumeSortOrder`，避免大纲域另立一份（§9）。
 */

/** 条目组内重排委托通用 `ordering.renumberInGroup`（只含未删行，写 0 起连续）。 */
export function renumberOutlineItemsInGroup(bookId: string, volumeId: number | null): void {
  renumberInGroup({
    table: 'outline_items',
    bookId,
    volumeId,
    // 条目排序/重排一律限定 `scope='entry'`：卷纲行（`scope='volume'`）固定 sort_order=0，
    // 不参与条目排序，混入会扰乱条目序号。
    extraWhereSql: "scope = 'entry'"
  })
}

/**
 * 指定组的下一个条目 `sort_order`（= 组内 `MAX+1`，空组 0）。
 *
 * **例外登记（不得与章节域 `nextChapterSortOrder` 合并）**：本函数强制附加
 * `scope = 'entry'` —— 卷纲行（`scope='volume'`）固定 `sort_order = 0` 常驻该卷，
 * 若不排除，任何卷的 `MAX(sort_order)` 至少为 0，会把新建的首个条目顶到 1（留空洞）。
 * 这是**领域不变量**，合并会把 scope 语义泄漏进章节域，故保留独立实现。
 *
 * 口径与通用取序一致：**不过滤软删行**，避免与待还原行撞序号。
 */
export function nextOutlineItemSortOrder(bookId: string, volumeId: number | null): number {
  const groupPredicate = volumeId === null ? 'volume_id IS NULL' : 'volume_id = ?'
  const params: unknown[] = volumeId === null ? [bookId] : [bookId, volumeId]
  return nextSortOrderInGroup(
    'outline_items',
    `book_id = ? AND ${groupPredicate} AND scope = 'entry'`,
    params
  )
}

/**
 * 指定 `kind` 的下一个卷 `sort_order`（转发章节域实现；`sort_order` 仅在 `(book_id, kind)`
 * 内有意义，三个 kind 各自独立连续）。供大纲域还原卷时追加到同 kind 末尾。
 */
export { nextVolumeSortOrder }
