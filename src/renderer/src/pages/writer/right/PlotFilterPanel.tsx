import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '../../../components/ui'
import { POPOVER_HIDE_DELAY, POPOVER_SHOW_DELAY } from '../../../components/popoverTiming'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import { SceneCard } from '../plot/SceneCard'
import {
  groupScenesByYear,
  plotLineLabel,
  plotSceneTime,
  plotSceneTitle,
  type PlotEraLabels,
  type PlotLineRow,
  type PlotSceneRow
} from '../plot/plotTree'
import { useSceneCardMode } from '../plot/useSceneCardMode'
import type { TimelineEntry } from '../timeline/timelineOrigin'
import { PlotSceneHoverCard, type PlotHoverAnchor } from './PlotSceneHoverCard'

/** 两个下拉的「全部」哨兵值（时间线 id / 剧情线 id 均不会等于它）。 */
const ALL_VALUE = 'all'
/** 悬停显示延迟（ms）：取通用浮层显示延迟。 */
const HOVER_SHOW_DELAY = POPOVER_SHOW_DELAY
/** 移出隐藏延迟（ms）：取通用浮层隐藏延迟。 */
const HOVER_HIDE_DELAY = POPOVER_HIDE_DELAY

/** 悬停载荷（矩形由面板在触发时实测）。 */
type SceneHoverPayload = Omit<PlotHoverAnchor, 'rect'>

export interface PlotFilterPanelProps {
  /** 全书未删除剧情线（不做时间线过滤；时间线下拉据此跨时间线筛选）。 */
  lines: PlotLineRow[]
  /** 全书未删除场景（`plot.scenes`）。 */
  scenes: PlotSceneRow[]
  /** 全书时间线列表（`timeline.list`）。 */
  timelines: TimelineEntry[]
  /** 当前选中时间线 id（作为时间线下拉默认值）。 */
  activeTimelineId: string | null
  /** 当前选中剧情线 id（作为剧情线下拉默认值）。 */
  activeLineId: number | null
  /** 归属书 id（实体胶囊按书匹配；空串 = 不匹配）。 */
  bookId: string
}

/**
 * 章节模块右栏「剧情」页签 / 大纲模块右栏：**时间线 + 剧情线双下拉（均为筛选器）+ 只读时间轴卡片**。
 *
 * - 一行两个 `Select`（`size="sm"`）：时间线（全部时间线 / 全书任一时间线）、
 *   剧情线（全部剧情线 / 该时间线下的任一条线）；两者共同过滤下方卡片；
 * - 列表**完整复用中栏时间轴结构**（时间列 + 节点圆点 + 纵向连线 + `SceneCard`），
 *   卡片含标题 / 正文 / 正文自动匹配的出场实体胶囊；`readonly` 隐藏编辑 / 删除按钮；
 * - 点击**只选中**（不跳转、不打开编辑器）；胶囊为只读展示，点击不跳转；
 * - 悬停 260ms 浮出完整正文浮窗（见 `PlotSceneHoverCard`），移出 120ms 后收起；
 *   胶囊悬停显示实体信息卡（与中栏同源 `useEntityHover`）。
 *
 * 两个宿主（章节「剧情」页签 / 大纲模块右栏）**渲染同一组件、同一套 props**，
 * 差异只由宿主容器表达：章节页签外层多一条页签条，大纲模块无页签且直接挂载本面板。
 */
export function PlotFilterPanel({
  lines,
  scenes,
  timelines,
  activeTimelineId,
  activeLineId,
  bookId
}: PlotFilterPanelProps): ReactElement {
  const { t } = useTranslation('writer')
  const { t: tPlot } = useTranslation('plot')
  const { t: tTimeline } = useTranslation('timeline')

  const eraLabels = useMemo<PlotEraLabels>(
    () => ({
      bc: tPlot('timeEra.bc'),
      zero: tPlot('timeEra.zero'),
      ad: tPlot('timeEra.ad'),
      yearUnit: tPlot('timeYearUnit')
    }),
    [tPlot]
  )

  // 用户手动选择优先；未选择时跟随当前选中时间线 / 剧情线（派生，不做 effect 同步）。
  const [timelineChoice, setTimelineChoice] = useState<string | null>(null)
  const [lineChoice, setLineChoice] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)
  const [hover, setHover] = useState<PlotHoverAnchor | null>(null)
  // 时间轴根引用：复用中栏的卡模式 / 胶囊容量测量（按实际可用宽）。
  const timelineRef = useRef<HTMLDivElement>(null)
  // 胶囊悬停实体信息卡（与中栏同源，事件委托在 `.plot-char-list`）。
  const charHover = useEntityHover()

  const timelineValue = useMemo(() => {
    if (timelineChoice === ALL_VALUE) return ALL_VALUE
    if (timelineChoice !== null && timelines.some((entry) => entry.id === timelineChoice)) {
      return timelineChoice
    }
    return activeTimelineId ?? ALL_VALUE
  }, [timelineChoice, timelines, activeTimelineId])

  const filteredLines = useMemo(
    () =>
      timelineValue === ALL_VALUE
        ? lines
        : lines.filter((line) => line.timelineId === timelineValue),
    [lines, timelineValue]
  )

  const lineValue = useMemo(() => {
    if (lineChoice === ALL_VALUE) return ALL_VALUE
    if (lineChoice !== null && filteredLines.some((line) => String(line.id) === lineChoice)) {
      return lineChoice
    }
    if (activeLineId !== null && filteredLines.some((line) => line.id === activeLineId)) {
      return String(activeLineId)
    }
    return ALL_VALUE
  }, [lineChoice, filteredLines, activeLineId])

  // 场景按时间排序（复用年组排序：已定年升序、未定年沉底；组内 sortOrder / id）。
  const filteredScenes = useMemo(() => {
    const lineIds = new Set(filteredLines.map((line) => line.id))
    const scoped = scenes.filter(
      (scene) =>
        lineIds.has(scene.lineId) && (lineValue === ALL_VALUE || String(scene.lineId) === lineValue)
    )
    return groupScenesByYear(scoped).flatMap((group) => group.scenes)
  }, [filteredLines, scenes, lineValue])

  // 卡模式 / 胶囊容量签名：按时间轴根的实际可用宽判定（右栏窄，通常落到紧凑模式）。
  const { mode, key: layoutKey } = useSceneCardMode(timelineRef, filteredScenes.length > 0)

  const timelineOptions = useMemo(
    () => [
      { value: ALL_VALUE, label: t('rightPlot.timelineAll') },
      ...timelines.map((entry) => ({
        value: entry.id,
        label: entry.name.trim() !== '' ? entry.name : tTimeline('defaultName')
      }))
    ],
    [timelines, t, tTimeline]
  )

  const lineOptions = useMemo(
    () => [
      { value: ALL_VALUE, label: t('rightPlot.lineAll') },
      ...filteredLines.map((line) => ({
        value: String(line.id),
        label: plotLineLabel(line, tPlot('unnamedLine'))
      }))
    ],
    [filteredLines, t, tPlot]
  )

  const activeSceneId =
    selectedSceneId !== null && filteredScenes.some((scene) => scene.id === selectedSceneId)
      ? selectedSceneId
      : null
  // 筛选变化后旧悬停可能落在不可见场景上：按当前列表裁剪，避免浮窗残留。
  const hoverAnchor =
    hover !== null && filteredScenes.some((scene) => scene.id === hover.scene.id) ? hover : null

  /* ---------- 悬停定时器（显示 260ms / 隐藏 120ms） ---------- */
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)

  const clearShowTimer = useCallback((): void => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const clearHideTimer = useCallback((): void => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) window.clearTimeout(showTimerRef.current)
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    }
  }, [])

  const handleHover = useCallback(
    (payload: SceneHoverPayload): void => {
      clearHideTimer()
      clearShowTimer()
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null
        setHover({ ...payload, rect: payload.el.getBoundingClientRect() })
      }, HOVER_SHOW_DELAY)
    },
    [clearHideTimer, clearShowTimer]
  )

  const handleLeave = useCallback((): void => {
    clearShowTimer()
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      setHover(null)
    }, HOVER_HIDE_DELAY)
  }, [clearHideTimer, clearShowTimer])

  return (
    <div className="rp-panel">
      {/* 筛选卡：一行两个下拉（同一行等分，窄栏文字省略）。
          `on-soft`：软底卡片上的控件换 --control-on-soft 底 + 描边，
          与「大纲」页签的下拉同款（与卡片同色会让边界不可辨）。 */}
      <div className="pane-region rp-card rp-plot-filters on-soft">
        <Select
          size="sm"
          value={timelineValue}
          onChange={setTimelineChoice}
          options={timelineOptions}
          ariaLabel={t('rightPlot.timelineFilterAria')}
        />
        <Select
          size="sm"
          value={lineValue}
          onChange={setLineChoice}
          options={lineOptions}
          ariaLabel={t('rightPlot.lineFilterAria')}
        />
      </div>

      {/* 只读时间轴：占满剩余高度，内部纵向滚动；结构与中栏 `.plot-timeline` 一致。 */}
      <div className="pane-region rp-card rp-card--list">
        {filteredLines.length === 0 ? (
          <div className="rp-list-empty">{t('rightPlot.lineEmpty')}</div>
        ) : filteredScenes.length === 0 ? (
          <div className="rp-list-empty">{t('rightPlot.filterEmpty')}</div>
        ) : (
          <div className="plot-timeline rp-plot-timeline" ref={timelineRef}>
            {filteredScenes.map((scene) => (
              <div
                className={`plot-row${scene.id === activeSceneId ? ' is-active' : ''}`}
                key={scene.id}
              >
                {/* 时间列：只读文本（无编辑入口）。 */}
                <div className="plot-col-time">
                  <span className="plot-time-text">
                    {plotSceneTime(scene, tPlot('undatedScene'), eraLabels)}
                  </span>
                </div>
                <div className="plot-col-node">
                  <span className="plot-dot" />
                </div>
                <div className="plot-col-content">
                  <SceneCard
                    scene={scene}
                    active={scene.id === activeSceneId}
                    mode={mode}
                    layoutKey={layoutKey}
                    bookId={bookId}
                    bodyText={scene.description}
                    onSelect={setSelectedSceneId}
                    onEditNode={() => undefined}
                    charHover={charHover}
                    onDeleteScene={() => undefined}
                    readonly
                    onHoverStart={(el, target) => {
                      // 胶囊区让给实体信息卡，避免同时浮出正文浮窗。
                      if (target.closest('.plot-char-block') !== null) return
                      handleHover({
                        scene,
                        el,
                        title: plotSceneTitle(scene, tPlot('unnamedScene')),
                        timeLabel: plotSceneTime(scene, tPlot('undatedScene'), eraLabels)
                      })
                    }}
                    onLeave={handleLeave}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PlotSceneHoverCard anchor={hoverAnchor} />
      {/* 实体胶囊悬停信息卡（与中栏同源）。 */}
      <HoverCard
        anchor={charHover.anchor}
        onClose={charHover.close}
        onPointerEnter={charHover.cancelHide}
        onPointerLeave={charHover.onMouseLeave}
      />
    </div>
  )
}

export default PlotFilterPanel
