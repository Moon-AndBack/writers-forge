import { getDb } from './index'
import { NOW, PIN_RANK_SQL, nextChapterSortOrder, renumberChaptersInGroup } from './chapterGroups'

/**
 * 卷 / 章重排与跨卷移动（自 `chapters.ts` 拆出，保持单文件 ≤500 行）。
 *
 * 统一规则（对齐 `schema/chapters.ts`）：
 * - **卷**：卷的 `sort_order` 仅在 `(book_id, kind)` 内有意义，`reorderVolume` 的 `targetIndex`
 *   解释为**同 kind 段内**位置，各 kind 互不跨越；展示序（自定义卷置顶）由
 *   `VOLUME_DISPLAY_ORDER_SQL` 独立表达，与落库序解耦，故重排**只重写同 kind 段**的
 *   `sort_order`，不会连带扰动其他 kind 的序号空间；
 * - **章**：组内排序键为 pin 段（top 特殊章 → 普通章 → 无 pin 特殊章 → bottom 特殊章），
 *   `reorderChapter` 的 `targetIndex` 解释为**所属 pin 段内**的位置（特殊章在 pin 段内
 *   可拖拽互排；普通章段与特殊段互不跨越）；写回时按段顺序整体重排 `sort_order`，
 *   与 `PIN_RANK_SQL` 始终自洽。
 */

/** 将卷移动到目标位置并重排 `sort_order`（0 起连续），越界自动收敛；不存在返回 false。 */
export function reorderVolume(id: number, targetIndex: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        'SELECT book_id AS bookId, kind, is_unfiled AS isUnfiled FROM volumes WHERE id = ? AND deleted_at IS NULL'
      )
      .get(id) as { bookId: string; kind: string; isUnfiled: number } | undefined
    // 系统「未分卷」卷固定置底，不参与常规卷拖拽排序。
    if (!row || row.isUnfiled === 1) return false

    // 序号空间按 kind 分离：仅取同 kind 的卷参与重排。
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
    for (let index = 0; index < ids.length; index += 1) {
      update.run(index, ids[index])
    }
    return true
  })()
}

/**
 * 将章移动到同卷内目标位置并重排 `sort_order`（0 起连续），越界自动收敛；不存在返回 false。
 * `targetIndex` = 目标 **pin 段内**位置：普通章只在普通章段内移动；特殊章只在
 * 其当前 pin 段（top / 无 pin / bottom）内移动——跨段移动用 `setChapterPin`。
 */
export function reorderChapter(id: number, targetIndex: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        'SELECT book_id AS bookId, volume_id AS volumeId, kind, pin FROM chapters WHERE id = ?'
      )
      .get(id) as { bookId: string; volumeId: number; kind: string; pin: string | null } | undefined
    if (!row) return false

    const rows = db
      .prepare(
        `SELECT id, kind, pin FROM chapters
         WHERE book_id = ? AND volume_id = ? AND deleted_at IS NULL
         ORDER BY ${PIN_RANK_SQL}, sort_order, id`
      )
      .all(row.bookId, row.volumeId) as Array<{ id: number; kind: string; pin: string | null }>

    // 段判别：普通章只与普通章同段；特殊章按 pin 值（含 NULL）分段。
    const segmentOf = (item: { kind: string; pin: string | null }): string => {
      if (item.kind === 'normal') return 'normal'
      if (item.pin === 'top') return 'top'
      if (item.pin === 'bottom') return 'bottom'
      return 'unpinned'
    }
    const ownSegment = segmentOf(row)
    const segmentIds = rows.filter((item) => segmentOf(item) === ownSegment).map((item) => item.id)

    const from = segmentIds.indexOf(id)
    if (from === -1) return false
    segmentIds.splice(from, 1)
    const to = Math.max(0, Math.min(Math.trunc(targetIndex), segmentIds.length))
    segmentIds.splice(to, 0, id)

    // 其余各段按原次序保留，最终按 PIN_RANK_SQL 段顺序拼接重写全组 sort_order。
    const ordered: number[] = []
    for (const segment of ['top', 'normal', 'unpinned', 'bottom'] as const) {
      if (segment === ownSegment) ordered.push(...segmentIds)
      else
        ordered.push(...rows.filter((item) => segmentOf(item) === segment).map((item) => item.id))
    }

    const update = db.prepare('UPDATE chapters SET sort_order = ? WHERE id = ?')
    for (let index = 0; index < ordered.length; index += 1) update.run(index, ordered[index])
    return true
  })()
}

/**
 * 将章移动到指定卷末尾（`volumeId` 必填，用户可选「未分卷」已移除；系统「未分卷」卷可作为
 * 目标）；重排源 / 目标两组；不存在返回 false。
 *
 * 应用层守卫（复合外键只保证同书、**不校验卷 kind**，故须在此拦截）：
 * - **分组容器卷（`kind='group'`）下不可挂章**（仅大纲页可见，章节页不认）；
 * - **特殊章不可移入自定义卷（`kind='custom'`）**——系统「未分卷」卷例外：它借用
 *   `custom` 语义但作为回收站还原 / 拖拽兜底容器，特殊章必须能落入（故按 `is_unfiled` 放行）。
 */
export function moveChapter(id: number, volumeId: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare('SELECT book_id AS bookId, volume_id AS volumeId, kind FROM chapters WHERE id = ?')
      .get(id) as { bookId: string; volumeId: number; kind: string } | undefined
    if (!row) return false
    if (typeof volumeId !== 'number' || !Number.isInteger(volumeId) || volumeId <= 0) return false
    const target = db
      .prepare(
        'SELECT id, kind, is_unfiled AS isUnfiled FROM volumes WHERE id = ? AND book_id = ? AND deleted_at IS NULL'
      )
      .get(volumeId, row.bookId) as { id: number; kind: string; isUnfiled: number } | undefined
    if (!target) return false
    if (target.kind === 'group') return false
    if (row.kind === 'special' && target.kind === 'custom' && target.isUnfiled !== 1) return false

    const order = nextChapterSortOrder(row.bookId, target.id)
    db.prepare(
      `UPDATE chapters SET volume_id = @volumeId, sort_order = @order, updated_at = ${NOW} WHERE id = @id`
    ).run({ id, volumeId: target.id, order })
    // 源组（若与目标不同）重排，保持序连续
    if (row.volumeId !== target.id) renumberChaptersInGroup(row.bookId, row.volumeId)
    return true
  })()
}
