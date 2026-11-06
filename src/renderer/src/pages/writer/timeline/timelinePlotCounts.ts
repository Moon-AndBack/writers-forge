import type { PlotLineRow } from '../plot/plotTree'

/**
 * 按 `timelineId` 聚合剧情线条数（数据源 `plot:listLines`，已排除软删除线）。
 *
 * 两处共用同一计数口径：
 * - 左栏 `TimelinePanel` 的删除禁用态（`SidePane` 用全书剧情线一次性聚合成 `Map`，
 *   不逐行发 IPC）；
 * - `useTimelineWorkspace.removeTimeline` 的写库前兜底（实时查询后用本函数聚合，
 *   避免沿用可能过期的 UI 计数）。
 */
export function countPlotLinesByTimeline(lines: readonly PlotLineRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) {
    counts.set(line.timelineId, (counts.get(line.timelineId) ?? 0) + 1)
  }
  return counts
}
