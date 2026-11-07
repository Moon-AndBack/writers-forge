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
  plotYearLabel,
  type PlotEraLabels,
  type PlotLineRow,
  type PlotSceneRow
} from '../plot/plotTree'
import { useSceneContentWidth } from '../plot/useSceneContentWidth'
import type { TimelineEntry } from '../timeline/timelineOrigin'
import { PlotSceneHoverCard, type PlotHoverAnchor } from './PlotSceneHoverCard'

/** 剧情线下拉的「全部」哨兵值（剧情线 id 均不会等于它）；时间线是独立轴，无「全部」项。 */
const ALL_LINES_VALUE = 'all'
/** 悬停显示延迟（ms）：取通用浮层显示延迟。 */
const HOVER_SHOW_DELAY = POPOVER_SHOW_DELAY
/** 移出隐藏延迟（ms）：取通用浮层隐藏延迟。 */
const HOVER_HIDE_DELAY = POPOVER_HIDE_DELAY

/** 悬停载荷（矩形由面板在触发时实测）。 */
type SceneHoverPayload = Omit<PlotHoverAnchor, 'rect'>

/** 剧情线手动选择：与做出选择时的时间线绑定，时间线一变即整体失效（派生为「全部」）。 */
interface LineChoice {
  timelineId: string
  value: string
}

export interface PlotFilterPanelProps {
  /** 全书未删除剧情线（组件内按所选时间线过滤）。 */
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
 * 章节 / 大纲模块右栏「剧情」页签：**时间线单选 + 剧情线筛选 + 只读时间轴卡片**。
 *
 * - 一行两个 `Select`（`size="sm"`）：时间线（只筛本面板，不切换全局当前时间线、
 *   不写 `timeline:active`）、剧情线（全部剧情线 / 该时间线下的任一条线）；
 *   两者共同过滤下方卡片；
 * - 单线模式：逐场景一行（时间列 + 节点圆点 + 纵向连线 + `SceneCard`）；
 *   全线模式：按绝对年分组（同年一排、未定年沉底），卡内标明来源剧情线，
 *   与独立时间线模块的时间轴观感一致；
 * - 卡片含标题 / 正文 / 正文自动匹配的出场实体胶囊；`readonly` 隐藏编辑 / 删除按钮；
 * - 点击**只选中**（不跳转、不打开编辑器）；胶囊为只读展示，点击不跳转；
 * - 悬停 260ms 浮出完整正文浮窗（见 `PlotSceneHoverCard`），移出 120ms 后收起；
 *   胶囊悬停显示实体信息卡（与中栏同源 `useEntityHover`）。
 *
 * 两个模块的「剧情」页签**渲染同一组件、同一套 props**（共用同一套面板实例），
 * 页签条样式也一致；差异只在页签子集（章节五页签 / 大纲三页签）。
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
  const [lineChoice, setLineChoice] = useState<LineChoice | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)
  const [hover, setHover] = useState<PlotHoverAnchor | null>(null)
  // 时间轴根引用：胶囊容量按内容列实际可用宽测量（右栏窄，胶囊仍在卡内底部）。
  const timelineRef = useRef<HTMLDivElement>(null)
  // 胶囊悬停实体信息卡（与中栏同源，事件委托在壳的胶囊容器）。
  const charHover = useEntityHover()

  // 右栏时间线筛选（只影响本面板，不切换全局当前时间线）：手动选择且仍在列表 → 用之；
  // 否则跟随当前选中时间线；再否则回退首条；时间线为空时置空串（下拉显示占位、列表空态）。
  const timelineValue = useMemo(() => {
    if (timelineChoice !== null && timelines.some((entry) => entry.id === timelineChoice)) {
      return timelineChoice
    }
    if (activeTimelineId !== null && timelines.some((entry) => entry.id === activeTimelineId)) {
      return activeTimelineId
    }
    return timelines[0]?.id ?? ''
  }, [timelineChoice, timelines, activeTimelineId])

  // 时间线是独立轴：选中哪条就只看该线下的剧情线；无时间线时为空集。
  const filteredLines = useMemo(
    () => (timelineValue === '' ? [] : lines.filter((line) => line.timelineId === timelineValue)),
    [lines, timelineValue]
  )

  const lineValue = useMemo(() => {
    // 旧时间线下的选择整体失效：视为「全部剧情线」，避免派生回退到当前选中线（意外值）。
    if (lineChoice !== null && lineChoice.timelineId !== timelineValue) return ALL_LINES_VALUE
    if (lineChoice !== null) {
      if (lineChoice.value === ALL_LINES_VALUE) return ALL_LINES_VALUE
      if (filteredLines.some((line) => String(line.id) === lineChoice.value)) {
        return lineChoice.value
      }
    }
    if (activeLineId !== null && filteredLines.some((line) => line.id === activeLineId)) {
      return String(activeLineId)
    }
    return ALL_LINES_VALUE
  }, [lineChoice, timelineValue, filteredLines, activeLineId])

  // 当前时间线内的场景按绝对年分组（已定年升序、未定年沉底；组内 sortOrder / id）：
  // 单线模式仍摊平为逐场景行，全线模式按年组聚合（场景来源线经 lineById 回填）。
  const sceneGroups = useMemo(() => {
    const lineIds = new Set(filteredLines.map((line) => line.id))
    const scoped = scenes.filter(
      (scene) =>
        lineIds.has(scene.lineId) &&
        (lineValue === ALL_LINES_VALUE || String(scene.lineId) === lineValue)
    )
    return groupScenesByYear(scoped)
  }, [filteredLines, scenes, lineValue])

  // 摊平列表：仅供滚动测量 / 选中与悬停有效性裁剪（分组结构在渲染分支中保留）。
  const filteredScenes = useMemo(() => sceneGroups.flatMap((group) => group.scenes), [sceneGroups])

  // 来源线回查（全线模式按 scene.lineId 取线名 / 线色）。
  const lineById = useMemo(
    () => new Map(filteredLines.map((line) => [line.id, line])),
    [filteredLines]
  )

  // 胶囊容量签名：按时间轴根的内容列实际可用宽测量，变化时触发重测。
  const layoutKey = useSceneContentWidth(timelineRef, filteredScenes.length > 0)

  const timelineOptions = useMemo(
    () =>
      timelines.map((entry) => ({
        value: entry.id,
        label: entry.name.trim() !== '' ? entry.name : tTimeline('defaultName')
      })),
    [timelines, tTimeline]
  )

  const lineOptions = useMemo(
    () => [
      { value: ALL_LINES_VALUE, label: t('rightPlot.lineAll') },
      ...filteredLines.map((line) => ({
        value: String(line.id),
        label: plotLineLabel(line, tPlot('unnamedLine'))
      }))
    ],
    [filteredLines, t, tPlot]
  )

  // 切换时间线即把剧情线重置为「全部剧情线」：旧选择只对旧线集有效，
  // 留着会派生回退到当前选中线（意外值）。用受控 onChange 同步重置，
  // 不写 effect（规避 `react-hooks/set-state-in-effect`）。
  const handleTimelineChange = useCallback((value: string): void => {
    setTimelineChoice(value)
    setLineChoice({ timelineId: value, value: ALL_LINES_VALUE })
  }, [])

  const handleLineChange = useCallback(
    (value: string): void => {
      setLineChoice({ timelineId: timelineValue, value })
    },
    [timelineValue]
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

  /** 单张只读场景卡（外层行负责时间列 / 圆点；单线与全线两分支共用）。
   * `line` 仅在跨线聚合（全线模式）传入，单线模式保持裸标题零视觉回归。 */
  const renderSceneCard = (scene: PlotSceneRow, line: PlotLineRow | null): ReactElement => (
    <SceneCard
      key={scene.id}
      scene={scene}
      active={scene.id === activeSceneId}
      layoutKey={layoutKey}
      bookId={bookId}
      bodyText={scene.description}
      line={line}
      onSelect={setSelectedSceneId}
      onEditNode={() => undefined}
      charHover={charHover}
      onDeleteScene={() => undefined}
      readonly
      onHoverStart={(el, target) => {
        // 胶囊区（壳的胶囊容器）让给实体信息卡，避免同时浮出正文浮窗。
        if (target.closest('.wf-entity-card__chips') !== null) return
        handleHover({
          scene,
          el,
          title: plotSceneTitle(scene, tPlot('unnamedScene')),
          timeLabel: plotSceneTime(scene, tPlot('undatedScene'), eraLabels)
        })
      }}
      onLeave={handleLeave}
    />
  )

  return (
    <div className="rp-panel">
      {/* 筛选卡：一行两个下拉（同一行等分，窄栏文字省略）。
          `on-soft`：软底卡片上的控件换 --control-on-soft 底 + 描边，
          与「大纲」页签的下拉同款（与卡片同色会让边界不可辨）。 */}
      <div className="pane-region rp-card rp-plot-filters on-soft">
        <Select
          size="sm"
          value={timelineValue}
          onChange={handleTimelineChange}
          options={timelineOptions}
          ariaLabel={t('rightPlot.timelineFilterAria')}
        />
        <Select
          size="sm"
          value={lineValue}
          onChange={handleLineChange}
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
            {lineValue === ALL_LINES_VALUE
              ? /* 全线模式：复用独立时间线模块的年组结构（同年一排、未定年沉底），
                   每张卡标明来源剧情线。 */
                sceneGroups.map((group) => (
                  <div className="plot-row plot-year-row" key={group.key}>
                    <div className="plot-col-time">
                      <span className="plot-time-text">
                        {plotYearLabel(group.absoluteYear, eraLabels, tPlot('undatedScene'))}
                      </span>
                    </div>
                    <div className="plot-col-node">
                      <span className="plot-dot" />
                    </div>
                    <div className="plot-col-content">
                      {group.scenes.map((scene) =>
                        renderSceneCard(scene, lineById.get(scene.lineId) ?? null)
                      )}
                    </div>
                  </div>
                ))
              : /* 单线模式：逐场景一行（时间列 + 圆点 + 单卡），与既有观感一致。 */
                filteredScenes.map((scene) => (
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
                    <div className="plot-col-content">{renderSceneCard(scene, null)}</div>
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
