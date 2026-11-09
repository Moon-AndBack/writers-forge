import { getDb } from './index'
import { PIN_RANK_SQL } from './chapterGroups'
import type { ChapterRow, VolumeRow } from './chapterTypes'

/**
 * 动态编号（`numberIndex`）计算：供渲染层「按位置动态编号」。
 *
 * 产品语义（对齐 `schema/chapters.ts`）：
 * - **卷**：`kind='normal'`（正文卷）按展示顺序编号 `1..n`；`custom` / `group` 恒 `0`
 *   （自定义卷整名不编号；分组容器仅大纲页可见、不参与编号）；
 * - **章**：`kind='normal'` 按**卷内**编号 `1..n`；`kind='special'` 恒 `0`（不占号）；
 *   组内排序与 `listChapters` 一致（pin 段：top → 普通 → 无 pin → bottom）。
 *
 * ⚠️ **实现要点（易错）**：单条编号查询**必须先在子查询里算完窗口序号、再在外层按 id 取值**——
 * 若写成 `SELECT ROW_NUMBER() OVER (...) FROM chapters WHERE id = ?`，窗口分区只剩目标行，
 * 结果恒为 `1`。且子查询内**只保留参与编号的行**（章 `kind='normal'`、卷 `kind='normal'`）：
 * 若把特殊章留在分区内，`ROW_NUMBER` 会给它们占号，导致普通章编号出现空洞。
 *
 * 位置：**查询层计算**。`listVolumes` / `listChapters` 在返回前一次遍历批量赋号；
 * 单条读（`getChapter` / `renameVolume`）用同口径查询定位。渲染层直接取用，
 * 不在渲染侧重写编号规则（避免两处漂移）。
 */

/**
 * 章节页卷展示序：自定义卷置顶在前（保持旧「特殊卷置顶」产品行为），系统「未分卷」卷
 * 固定置底（兜底容器，不参与常规卷排序），各自段内按 `sort_order, id`。
 */
export const VOLUME_DISPLAY_ORDER_SQL = `CASE WHEN is_unfiled = 1 THEN 2 WHEN kind = 'custom' THEN 0 ELSE 1 END, sort_order, id`

/** 批量赋卷 `numberIndex`：输入须已按 `VOLUME_DISPLAY_ORDER_SQL` 排序；非 `normal` 卷恒 0。 */
export function assignVolumeNumberIndex(rows: VolumeRow[]): VolumeRow[] {
  let index = 0
  return rows.map((row) => {
    if (row.kind !== 'normal') return { ...row, numberIndex: 0 }
    index += 1
    return { ...row, numberIndex: index }
  })
}

/**
 * 批量赋章 `numberIndex`：输入须先按卷展示序 + 组内 pin 段（top → 普通 → 无 pin → bottom）、
 * `sort_order, id` 排序；每卷独立计数，特殊章赋 0 且不占号。
 */
export function assignChapterNumberIndex(rows: ChapterRow[]): ChapterRow[] {
  const counters = new Map<number, number>()
  return rows.map((row) => {
    if (row.kind === 'special') return { ...row, numberIndex: 0 }
    const next = (counters.get(row.volumeId) ?? 0) + 1
    counters.set(row.volumeId, next)
    return { ...row, numberIndex: next }
  })
}

/**
 * 单卷 `numberIndex`：正文卷（`kind='normal'`）1..n；`custom` / `group` / 不存在 → 0
 * （与 `listVolumes` 同口径）。`group` 卷对章节页不可见，故此处按 `CHAPTER_VISIBLE_VOLUME_KINDS` 取。
 */
export function resolveVolumeNumberIndex(bookId: string, id: number): number {
  const row = getDb()
    .prepare(
      `SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, id) AS numberIndex FROM (
         SELECT id, sort_order FROM volumes
         WHERE book_id = ? AND deleted_at IS NULL AND kind = 'normal'
       ) WHERE id = ?`
    )
    .get(bookId, id) as { id: number; numberIndex: number } | undefined
  return row?.numberIndex ?? 0
}

/** 单章 `numberIndex`：卷内普通章 1..n；特殊章 / 不存在 → 0（与 `listChapters` 同口径）。 */
export function resolveChapterNumberIndex(bookId: string, id: number): number {
  const row = getDb()
    .prepare(
      `SELECT id, ROW_NUMBER() OVER (PARTITION BY volume_id ORDER BY ${PIN_RANK_SQL}, sort_order, id) AS numberIndex FROM (
         SELECT id, volume_id, sort_order, pin, kind FROM chapters
         WHERE book_id = ? AND deleted_at IS NULL AND kind = 'normal'
       ) WHERE id = ?`
    )
    .get(bookId, id) as { id: number; numberIndex: number } | undefined
  return row?.numberIndex ?? 0
}
