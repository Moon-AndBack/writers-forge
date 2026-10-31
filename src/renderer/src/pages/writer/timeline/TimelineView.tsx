import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import TimelineActivityActions from './TimelineActivityActions'
import NewTimelineDialog from './NewTimelineDialog'
import {
  isStoredOrigin,
  parseTimelineList,
  resolveActiveEntry,
  timelineActiveKey,
  timelineListKey
} from './timelineOrigin'
import {
  getPlotLineColorValue,
  groupScenesByYear,
  normalizePlotLineColor,
  plotLineLabel,
  plotSceneTitle,
  plotYearLabel,
  type PlotLineRow,
  type PlotSceneRow
} from '../plot/plotTree'

export interface TimelineViewProps {
  /** 书籍 id（路由参数）；按书读起点键，无书时用裸键兜底。 */
  bookId?: string
  /** 当前选中时间线的 origin（渲染层持有；缺省时按书键自行读取）。 */
  origin?: string
  /** 当前选中时间线 id（用于自行读取 origin 时定位）。 */
  activeTimelineId?: string | null
  /** 新建时间线入口（标题栏按钮触发）；缺省则不渲染入口。 */
  onCreateTimeline?: (name: string, origin?: string) => void | Promise<unknown>
  /** 当前选中场景 id（页面层持有，与右栏只读详情共享；null = 未选中）。 */
  selectedSceneId?: number | null
  /** 场景选中回调（页面层包装：选中 + 隐藏时自动展开右栏）。 */
  onSelectScene?: (id: number) => void
}

/**
 * 独立时间线中栏：元年行 + 全书剧情按年聚合（跨线同年一排，只读）。
 *
 * - 样式复用剧情时间线（`plot-timeline` / `plot-row` / `plot-col-time` /
 *   `plot-col-node` / `plot-dot` / `plot-col-content` / `plot-scene-card`），
 *   不新增全局 token；独立 `is-origin` 类区分首段；
 * - 首段：起点时间 + 元年说明卡 + 人物无；不渲染「＋」缝、不绑定选中；
 * - 次段：全书剧情经 `api.plot.listLines/listScenes` 按年分组跨线聚合
 *  （`groupScenesByYear`，同年一排多卡，未定年组沉底），卡可点击选中
 *  （选中态落卡自身 `is-active`，`is-readonly` 保留；选中详情在右栏只读展示，
 *  不进编辑通道）；
 * - 起点经既有 settings 通道按书键读取，读不到回退 `t('originDefault')`（默认「元年」）；
 * - 起点经既有 settings 通道按书键读取，读不到回退 `t('originDefault')`（默认「元年」）；
 * - 不进 `plot` 计数排序写通道，不调 plot CRUD。
 */
export default function TimelineView({
  bookId,
  origin,
  activeTimelineId = null,
  onCreateTimeline,
  selectedSceneId = null,
  onSelectScene
}: TimelineViewProps) {
  const { t } = useTranslation('timeline')
  const { t: tPlot } = useTranslation('plot')
  const [stored, setStored] = useState<string | null>(
    origin !== undefined ? (isStoredOrigin(origin) ? origin : null) : null
  )
  const [lines, setLines] = useState<PlotLineRow[]>([])
  const [scenes, setScenes] = useState<PlotSceneRow[]>([])
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      window.api?.settings.get(timelineListKey(bookId)),
      window.api?.settings.get(timelineActiveKey(bookId))
    ])
      .then(([listRaw, storedActive]) => {
        if (cancelled) return
        const list = parseTimelineList(listRaw)
        const resolvedActive = activeTimelineId ?? storedActive
        const entry = resolveActiveEntry(list, resolvedActive)
        setStored(entry && isStoredOrigin(entry.origin) ? entry.origin : null)
      })
      .catch(() => {
        if (!cancelled) setStored(null)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, activeTimelineId, origin])

  useEffect(() => {
    let cancelled = false
    const api = window.api?.plot
    if (!api || !bookId) {
      return () => {
        cancelled = true
      }
    }
    void Promise.all([api.listLines(bookId), api.listScenes(bookId)])
      .then(([nextLines, nextScenes]) => {
        if (cancelled) return
        setLines(nextLines)
        setScenes(nextScenes)
      })
      .catch(() => {
        if (cancelled) return
        setLines([])
        setScenes([])
      })
    return () => {
      cancelled = true
    }
  }, [bookId])

  const resolvedStored = origin !== undefined ? (isStoredOrigin(origin) ? origin : null) : stored
  const originDisplay = isStoredOrigin(resolvedStored) ? resolvedStored.trim() : t('originDefault')
  // 按当前选中时间线过滤剧情线 / 场景：仅显示该时间线归属的剧情线及其下场景。
  // activeTimelineId 为空时回退全量（时间线未加载 / 无时间线兜底），避免首帧空白。
  const filteredLines = useMemo(() => {
    if (!activeTimelineId) return lines
    return lines.filter((row) => row.timelineId === activeTimelineId)
  }, [lines, activeTimelineId])
  const filteredScenes = useMemo(() => {
    if (!activeTimelineId) return scenes
    const allowedLineIds = new Set(filteredLines.map((row) => row.id))
    return scenes.filter((scene) => allowedLineIds.has(scene.lineId))
  }, [scenes, activeTimelineId, filteredLines])
  // 全书跨线按年分组（后端已按绝对年优先排序，此处再分组聚合，同年一排）。
  // 起点作为卡片合并进元年组（absoluteYear === 0）：若无元年组则创建，origin 卡与元年场景并排。
  const groups = useMemo(() => {
    const base = groupScenesByYear(filteredScenes)
    if (base.some((group) => group.absoluteYear === 0)) return base
    const zeroGroup = { absoluteYear: 0, key: 'y:0', scenes: [] as PlotSceneRow[] }
    const next = base.slice()
    const idx = next.findIndex(
      (group) => group.absoluteYear === null || (group.absoluteYear ?? 0) > 0
    )
    if (idx === -1) next.push(zeroGroup)
    else next.splice(idx, 0, zeroGroup)
    return next
  }, [filteredScenes])
  const lineById = useMemo(
    () => new Map(filteredLines.map((row) => [row.id, row])),
    [filteredLines]
  )
  const eraLabels = {
    bc: tPlot('timeEra.bc'),
    zero: tPlot('timeEra.zero'),
    ad: tPlot('timeEra.ad'),
    yearUnit: tPlot('timeYearUnit')
  }

  return (
    <>
      {onCreateTimeline ? <TimelineActivityActions onAdd={() => setCreateOpen(true)} /> : null}
      {createOpen && onCreateTimeline ? (
        <NewTimelineDialog
          onClose={() => setCreateOpen(false)}
          onSubmit={(name, originValue) => {
            void onCreateTimeline(name, originValue)
          }}
        />
      ) : null}
      <div className="editor-scroll">
        <div className="editor-inner is-full">
          <div className="plot-timeline timeline-main">
            {groups.length === 0 ? (
              <div className="plot-timeline-empty">{t('plotEmpty')}</div>
            ) : (
              groups.map((group) => (
                <div
                  className={`plot-row plot-year-row${group.absoluteYear === 0 ? ' is-origin' : ''}`}
                  key={group.key}
                >
                  <div className="plot-col-time">
                    <span className="plot-time-text">
                      {plotYearLabel(group.absoluteYear, eraLabels, tPlot('undatedScene'))}
                    </span>
                  </div>
                  <div className="plot-col-node">
                    <span className="plot-dot" aria-hidden="true" />
                  </div>
                  <div className="plot-col-content">
                    {group.absoluteYear === 0 ? (
                      <article className="plot-scene-card is-origin" title={originDisplay}>
                        <h3 className="plot-scene-title">{t('originTitle')}</h3>
                        <p className="plot-scene-desc">{t('originNote')}</p>
                      </article>
                    ) : null}
                    {group.scenes.map((scene) => {
                      const line = lineById.get(scene.lineId)
                      // 正文按段落拆行（派生摘要块级之间用 `\n` 分隔）；空行丢弃。
                      const paragraphs = scene.description
                        .split('\n')
                        .map((text) => text.trim())
                        .filter((text) => text !== '')
                      // 来源线标签：按该线配置色着色（非法 key 归一回退首色）。
                      const tagColor = line
                        ? getPlotLineColorValue(normalizePlotLineColor(line.lineColor))
                        : null
                      return (
                        <article
                          className={`plot-scene-card is-readonly${scene.id === selectedSceneId ? ' is-active' : ''}`}
                          key={scene.id}
                          onClick={() => onSelectScene?.(scene.id)}
                        >
                          {line ? (
                            <span
                              className="plot-line-tag"
                              style={
                                tagColor
                                  ? {
                                      color: tagColor,
                                      backgroundColor: `${tagColor}1f`
                                    }
                                  : undefined
                              }
                            >
                              {plotLineLabel(line, tPlot('unnamedLine'))}
                            </span>
                          ) : null}
                          <h3 className="plot-scene-title">
                            {plotSceneTitle(scene, tPlot('unnamedScene'))}
                          </h3>
                          {paragraphs.length > 0 ? (
                            <div className="plot-scene-desc plot-scene-body">
                              {paragraphs.map((paragraph, index) => (
                                <p className="plot-scene-para" key={`para-${index}`}>
                                  {paragraph}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  )
}
