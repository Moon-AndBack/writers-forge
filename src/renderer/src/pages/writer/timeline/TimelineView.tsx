import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadErrorState } from '../../../components/LoadErrorState'
import { EntityStyleCard } from '../../../components/ui'
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
  /** 当前选中时间线的起点描述（纯文本；为空时元年卡回退 `t('originNote')`）。 */
  description?: string
  /** 当前选中时间线 id（用于自行读取 origin 时定位）。 */
  activeTimelineId?: string | null
  /** 新建时间线入口（标题栏按钮触发）；缺省则不渲染入口。 */
  onCreateTimeline?: (name: string, description?: string) => void | Promise<unknown>
  /** 当前选中场景 id（页面层持有，与右栏只读详情共享；null = 未选中）。 */
  selectedSceneId?: number | null
  /** 场景选中回调（页面层包装：选中 + 隐藏时自动展开右栏）。 */
  onSelectScene?: (id: number) => void
}

/**
 * 独立时间线中栏：元年行 + 全书剧情按年聚合（跨线同年一排，只读）。
 *
 * - 样式复用剧情时间线（`plot-timeline` / `plot-row` / `plot-col-time` /
 *   `plot-col-node` / `plot-dot` / `plot-col-content`），卡片统一走通用壳
 *   `EntityStyleCard`（与剧情 / 伏笔 / 设定卡同一套骨架与视觉规格），
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
  description = '',
  activeTimelineId = null,
  onCreateTimeline,
  selectedSceneId = null,
  onSelectScene
}: TimelineViewProps) {
  const { t } = useTranslation('timeline')
  const { t: tPlot } = useTranslation('plot')
  const { t: tCommon } = useTranslation('common')
  const [stored, setStored] = useState<string | null>(
    origin !== undefined ? (isStoredOrigin(origin) ? origin : null) : null
  )
  const [lines, setLines] = useState<PlotLineRow[]>([])
  const [scenes, setScenes] = useState<PlotSceneRow[]>([])
  // 列表读取状态（按书打标）：`loading` = 首帧 / 换书 / 重试中，`error` = 读取失败。
  const [listState, setListState] = useState<{
    bookId: string | null
    phase: 'loading' | 'ready' | 'error'
  }>({ bookId: null, phase: 'loading' })
  // 重试令牌：递增即重跑列表 effect（只影响失败后的显式重试）。
  const [reloadKey, setReloadKey] = useState(0)
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
    const targetBookId = bookId
    void Promise.all([api.listLines(bookId), api.listScenes(bookId)])
      .then(([nextLines, nextScenes]) => {
        if (cancelled) return
        setLines(nextLines)
        setScenes(nextScenes)
        setListState({ bookId: targetBookId, phase: 'ready' })
      })
      .catch(() => {
        if (cancelled) return
        setLines([])
        setScenes([])
        setListState({ bookId: targetBookId, phase: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [bookId, reloadKey])

  // 列表读取态派生：无 API / 无书时不发起读取（保持既有兜底展示，不显示加载 / 错误）。
  const listActive = Boolean(bookId) && window.api?.plot !== undefined
  const listLoading = listActive && (listState.bookId !== bookId || listState.phase === 'loading')
  const listError = listActive && listState.bookId === bookId && listState.phase === 'error'
  /** 重试：先切回加载态，再靠令牌重跑上面的 effect。 */
  const retryList = (): void => {
    setListState({ bookId: bookId ?? null, phase: 'loading' })
    setReloadKey((key) => key + 1)
  }

  const resolvedStored = origin !== undefined ? (isStoredOrigin(origin) ? origin : null) : stored
  const originDisplay = isStoredOrigin(resolvedStored) ? resolvedStored.trim() : t('originDefault')
  // 元年卡正文 = 当前时间线的起点描述（用户可编辑）；为空时回退「故事开始了」。
  const originNoteDisplay = description.trim() !== '' ? description : t('originNote')
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
          onSubmit={(name, description) => {
            void onCreateTimeline(name, description)
          }}
        />
      ) : null}
      <div className="editor-scroll">
        <div className="editor-inner is-full">
          <div
            className={`plot-timeline timeline-main${listError || listLoading ? ' is-status' : ''}`}
          >
            {listError ? (
              /* 读取失败：与「正常空时间线」区分，给出重试入口。 */
              <LoadErrorState onRetry={retryList} />
            ) : listLoading ? (
              <div className="timeline-loading">{tCommon('loading')}</div>
            ) : groups.length === 0 ? (
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
                      <EntityStyleCard
                        className="plot-scene-card is-origin"
                        readonly
                        cardProps={{ title: originDisplay }}
                        head={
                          <h3 className="wf-entity-card__title plot-scene-title">
                            {t('originTitle')}
                          </h3>
                        }
                        description={originNoteDisplay}
                        descriptionClassName="plot-scene-body"
                      />
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
                        <EntityStyleCard
                          key={scene.id}
                          className="plot-scene-card"
                          active={scene.id === selectedSceneId}
                          readonly
                          cardProps={{ onClick: () => onSelectScene?.(scene.id) }}
                          head={
                            <div className="plot-scene-heading">
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
                              <h3 className="wf-entity-card__title plot-scene-title">
                                {plotSceneTitle(scene, tPlot('unnamedScene'))}
                              </h3>
                            </div>
                          }
                          description={
                            paragraphs.length > 0
                              ? paragraphs.map((paragraph, index) => (
                                  <p className="plot-scene-para" key={`para-${index}`}>
                                    {paragraph}
                                  </p>
                                ))
                              : undefined
                          }
                          descriptionClassName="plot-scene-body"
                        />
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
