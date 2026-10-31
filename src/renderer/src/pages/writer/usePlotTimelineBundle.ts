/**
 * 剧情 / 时间线装配透传包 hook：把「剧情选中（`plot.selectScene` 包装）+
 * 时间线选中状态 + 两处『点选后右栏隐藏时自动展开』」聚合为一处，
 * 供 `Writer.tsx` 一行取用、按原名解构后透传三栏（左栏剧情线 / 中栏时间轴 / 右栏编辑器）。
 *
 * 与 `useDossierBundle` 同款先例：右栏显隐真源在页面层，经 `rightPaneHidden` /
 * `showRightPane` 传入；数据与选中口径仍由 `usePlotWorkspace` 持有，此处只做包装，不改行为。
 */
import { useCallback, useMemo, useState } from 'react'
import type { PlotSceneRow } from './plot/plotTree'
import type { PlotWorkspace } from './plot/usePlotWorkspace'

/** 剧情 / 时间线装配态（供 `Writer.tsx` 透传三栏）。 */
export interface PlotTimelineBundle {
  /** 时间线选中场景 id（null = 未选中；与剧情选中互不干扰）。 */
  timelineSelectedSceneId: number | null
  /** 时间线选中场景行（经 `plot.scenes` 按 id 解析；被删除后回退 null）。 */
  timelineScene: PlotSceneRow | null
  /** 选中剧情场景：更新选中 + 右栏隐藏时自动展开。 */
  onSelectPlotScene: (id: number) => void
  /** 选中时间线场景：更新选中 + 右栏隐藏时自动展开（右栏仅只读详情 + 起点可编辑）。 */
  onSelectTimelineScene: (id: number) => void
}

export function usePlotTimelineBundle(
  plot: PlotWorkspace,
  rightPaneHidden: boolean,
  showRightPane: () => void
): PlotTimelineBundle {
  const { scenes, selectScene } = plot

  // 时间线选中场景 id（null = 未选中；与剧情选中互不干扰；行经 `plot.scenes` 按 id 解析）。
  const [timelineSelectedSceneId, setTimelineSelectedSceneId] = useState<number | null>(null)
  // 时间线选中场景行（被删除后回退 null，右栏渲染空态）。
  const timelineScene = useMemo(
    () => scenes.find((row) => row.id === timelineSelectedSceneId) ?? null,
    [scenes, timelineSelectedSceneId]
  )

  const onSelectPlotScene = useCallback(
    (id: number): void => {
      selectScene(id)
      if (rightPaneHidden) showRightPane()
    },
    [selectScene, rightPaneHidden, showRightPane]
  )

  const onSelectTimelineScene = useCallback(
    (id: number): void => {
      setTimelineSelectedSceneId(id)
      if (rightPaneHidden) showRightPane()
    },
    [rightPaneHidden, showRightPane]
  )

  return { timelineSelectedSceneId, timelineScene, onSelectPlotScene, onSelectTimelineScene }
}
