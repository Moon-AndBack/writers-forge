/**
 * 剧情 / 时间线装配透传包 hook：把「剧情选中（`plot.selectScene` 包装）+
 * 时间线选中状态 + 两处『点选后右栏隐藏时自动展开』」聚合为一处，
 * 供 `Writer.tsx` 一行取用、按原名解构后透传三栏（左栏剧情线 / 中栏时间轴 / 右栏编辑器）。
 *
 * 与 `useDossierBundle` 同款先例：右栏显隐真源在页面层，经 `rightPaneHidden` /
 * `showRightPane` 传入；数据与选中口径仍由 `usePlotWorkspace` 持有，此处只做包装，不改行为。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlotSceneRow } from './plot/plotTree'
import type { PlotWorkspace } from './plot/usePlotWorkspace'

/**
 * 时间线选中项：`'origin'` = 元年卡（起点），`number` = 场景 id，`null` = 未选中。
 * 以 union 而非哨兵 id（如 -1）表达，语义清晰且类型上阻止把起点当场景 id 误用。
 */
export type TimelineSelection = 'origin' | number | null

/** 剧情 / 时间线装配态（供 `Writer.tsx` 透传三栏）。 */
export interface PlotTimelineBundle {
  /** 时间线选中项（默认 `'origin'`：进入模块即展示起点编辑）。 */
  timelineSelection: TimelineSelection
  /** 是否选中元年卡（派生；右栏据此只渲染起点卡）。 */
  timelineOriginSelected: boolean
  /** 时间线选中场景行（仅选中 `number` 时按 id 解析；被删除 / 未选场景 → null）。 */
  timelineScene: PlotSceneRow | null
  /** 选中剧情场景：更新选中 + 右栏隐藏时自动展开。 */
  onSelectPlotScene: (id: number) => void
  /** 选中时间线元年卡：更新选中 + 右栏隐藏时自动展开。 */
  onSelectTimelineOrigin: () => void
  /** 选中时间线场景：更新选中 + 右栏隐藏时自动展开（右栏随之只显示该场景只读详情）。 */
  onSelectTimelineScene: (id: number) => void
}

export function usePlotTimelineBundle(
  plot: PlotWorkspace,
  activeTimelineId: string | null,
  rightPaneHidden: boolean,
  showRightPane: () => void
): PlotTimelineBundle {
  const { scenes, selectScene } = plot

  // 时间线选中项（默认起点；null 保留给「场景被删 / 显式清空」等边界）。
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection>('origin')
  const timelineOriginSelected = timelineSelection === 'origin'
  // 时间线选中场景行：仅 number 时查找（起点 / 未选中不解析；被删除后回退 null）。
  const timelineScene = useMemo(
    () =>
      typeof timelineSelection === 'number'
        ? (scenes.find((row) => row.id === timelineSelection) ?? null)
        : null,
    [scenes, timelineSelection]
  )

  // 切换时间线（`activeTimelineId` 变化）→ 选中项回到起点：原场景可能不属于新时间线。
  // 首次从 null 装载到首个 id 属于「初始载入」而非用户切换，跳过（避免竞态清掉已点选的卡）。
  // 切模块不重置：本 hook 所在页面常驻，effect 不触发。
  const prevTimelineIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (activeTimelineId === null) return
    const prev = prevTimelineIdRef.current
    prevTimelineIdRef.current = activeTimelineId
    if (prev !== null && prev !== activeTimelineId) setTimelineSelection('origin')
  }, [activeTimelineId])

  const onSelectPlotScene = useCallback(
    (id: number): void => {
      selectScene(id)
      if (rightPaneHidden) showRightPane()
    },
    [selectScene, rightPaneHidden, showRightPane]
  )

  const onSelectTimelineOrigin = useCallback((): void => {
    setTimelineSelection('origin')
    if (rightPaneHidden) showRightPane()
  }, [rightPaneHidden, showRightPane])

  const onSelectTimelineScene = useCallback(
    (id: number): void => {
      setTimelineSelection(id)
      if (rightPaneHidden) showRightPane()
    },
    [rightPaneHidden, showRightPane]
  )

  return {
    timelineSelection,
    timelineOriginSelected,
    timelineScene,
    onSelectPlotScene,
    onSelectTimelineOrigin,
    onSelectTimelineScene
  }
}
