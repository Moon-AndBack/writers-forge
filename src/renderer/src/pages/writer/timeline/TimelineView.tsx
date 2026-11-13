import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadErrorState } from '../../../components/LoadErrorState'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import { EntityStyleCard } from '../../../components/ui'
import { docJsonToParagraphs } from '../../../../../shared/richTextDoc'
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
  groupScenesByYear,
  plotSceneTitle,
  plotYearLabel,
  type PlotLineRow,
  type PlotSceneRow
} from '../plot/plotTree'
import { PlotSceneHeading } from '../plot/PlotSceneHeading'

export interface TimelineViewProps {
  /** 书籍 id（路由参数）；按书读起点键，无书时用裸键兜底。 */
  bookId?: string
  /** 当前选中时间线的 origin（渲染层持有；缺省时按书键自行读取）。 */
  origin?: string
  /** 当前选中时间线的起点卡片标题（页面层派生；空串回退「起点」；只影响卡头标题）。 */
  originName?: string
  /** 当前选中时间线的起点描述富文本（Tiptap JSON 串；为空时元年卡回退 `t('originNote')`）。 */
  descriptionJson?: string
  /** 当前选中时间线 id（用于自行读取 origin 时定位）。 */
  activeTimelineId?: string | null
  /** 全书未删除剧情线（页面层剧情数据源下发；按当前时间线过滤后展示）。 */
  lines?: PlotLineRow[]
  /** 全书未删除场景（页面层剧情数据源下发；按当前时间线的剧情线过滤后展示）。 */
  scenes?: PlotSceneRow[]
  /** 剧情树是否仍在加载（页面层剧情数据源下发）。 */
  loading?: boolean
  /** 剧情树最近一次加载失败信息（`null` = 正常；页面层剧情数据源下发）。 */
  error?: string | null
  /** 重新拉取剧情树（错误态重试）。 */
  onReload?: () => void
  /** 新建时间线入口（标题栏按钮触发）；缺省则不渲染入口。 */
  onCreateTimeline?: (name: string, description?: RichTextBodyValue) => void | Promise<unknown>
  /** 当前选中场景 id（页面层持有，与右栏只读详情共享；null = 未选中）。 */
  selectedSceneId?: number | null
  /** 是否选中元年卡（页面层持有，与右栏起点编辑共享）。 */
  originSelected?: boolean
  /** 场景选中回调（页面层包装：选中 + 隐藏时自动展开右栏）。 */
  onSelectScene?: (id: number) => void
  /** 元年卡选中回调（页面层包装：选中 + 隐藏时自动展开右栏）。 */
  onSelectOrigin?: () => void
}

/**
 * 独立时间线中栏：元年行 + 全书剧情按年聚合（跨线同年一排，只读）。
 *
 * - 样式复用剧情时间线（`plot-timeline` / `plot-row` / `plot-col-time` /
 *   `plot-col-node` / `plot-dot` / `plot-col-content`），卡片统一走通用壳
 *   `EntityStyleCard`（与剧情 / 伏笔 / 设定卡同一套骨架与视觉规格），
 *   不新增全局 token；独立 `is-origin` 类区分首段；
 * - 首段：起点时间 + 元年说明卡 + 人物无；不渲染「＋」缝，元年卡可点选起点；
 * - 次段：全书剧情由页面层剧情数据源下发（`lines` / `scenes`），按当前时间线过滤后
 *   经 `groupScenesByYear` 按年分组聚合（同年一排多卡，未定年组沉底），卡可点击选中
 *  （选中态落卡自身 `is-active`，`is-readonly` 保留；选中详情在右栏只读展示，
 *  不进编辑通道）；
 * - 起点经既有 settings 通道按书键读取，读不到回退 `t('originDefault')`（默认「元年」）；
 * - 不进 `plot` 计数排序写通道，不调 plot CRUD；数据与剧情模块 / 右栏剧情页签同源。
 */
export default function TimelineView({
  bookId,
  origin,
  originName = '',
  descriptionJson = '',
  activeTimelineId = null,
  lines = [],
  scenes = [],
  loading = false,
  error = null,
  onReload,
  onCreateTimeline,
  selectedSceneId = null,
  originSelected = false,
  onSelectScene,
  onSelectOrigin
}: TimelineViewProps) {
  const { t } = useTranslation('timeline')
  const { t: tPlot } = useTranslation('plot')
  const { t: tCommon } = useTranslation('common')
  const [stored, setStored] = useState<string | null>(
    origin !== undefined ? (isStoredOrigin(origin) ? origin : null) : null
  )
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

  const resolvedStored = origin !== undefined ? (isStoredOrigin(origin) ? origin : null) : stored
  const originDisplay = isStoredOrigin(resolvedStored) ? resolvedStored.trim() : t('originDefault')
  // 元年卡卡头标题：自定义起点名（trim 后为空 → 回退「起点」）；时间列仍是「元年」。
  const originTitle = originName.trim() !== '' ? originName : t('originTitle')
  // 元年卡正文 = 当前时间线的起点描述富文本（用户可编辑）：按块级段落拆行、逐段渲染
  // （段首缩进由 `.plot-scene-para` 提供）；无段落（空文档 / 老数据空描述）时回退「故事开始了」。
  const originParagraphs = useMemo(() => docJsonToParagraphs(descriptionJson), [descriptionJson])
  // 按当前选中时间线过滤剧情线 / 场景：仅显示该时间线归属的剧情线及其下场景。
  // activeTimelineId 为空 = 时间线尚未加载完成：返回空集，避免把其它时间线的场景错当本线内容。
  // 比较前两侧 trim + 小写归一（主进程已 trim，防老数据 / 手改设置残留空白或大小写差异）。
  const filteredLines = useMemo(() => {
    const target = activeTimelineId?.trim().toLowerCase() ?? ''
    if (target === '') return []
    return lines.filter((row) => row.timelineId.trim().toLowerCase() === target)
  }, [lines, activeTimelineId])
  const filteredScenes = useMemo(() => {
    const allowedLineIds = new Set(filteredLines.map((row) => row.id))
    return scenes.filter((scene) => allowedLineIds.has(scene.lineId))
  }, [scenes, filteredLines])
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
          bookId={bookId ?? ''}
          onClose={() => setCreateOpen(false)}
          onSubmit={(name, description) => {
            void onCreateTimeline(name, description)
          }}
        />
      ) : null}
      <div className="editor-scroll">
        <div className="editor-inner is-full">
          <div
            className={`plot-timeline timeline-main${error !== null || loading ? ' is-status' : ''}`}
          >
            {loading ? (
              <div className="timeline-loading">{tCommon('loading')}</div>
            ) : error !== null ? (
              /* 读取失败：与「正常空时间线」区分，给出重试入口。 */
              <LoadErrorState onRetry={() => onReload?.()} />
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
                        active={originSelected}
                        readonly
                        cardProps={{ title: originDisplay, onClick: () => onSelectOrigin?.() }}
                        head={
                          <h3 className="wf-entity-card__title plot-scene-title">{originTitle}</h3>
                        }
                        description={
                          originParagraphs.length > 0
                            ? originParagraphs.map((paragraph, index) => (
                                <p className="plot-scene-para" key={`origin-para-${index}`}>
                                  {paragraph}
                                </p>
                              ))
                            : t('originNote')
                        }
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
                      return (
                        <EntityStyleCard
                          key={scene.id}
                          className="plot-scene-card"
                          active={scene.id === selectedSceneId}
                          readonly
                          cardProps={{ onClick: () => onSelectScene?.(scene.id) }}
                          head={
                            <PlotSceneHeading
                              line={line ?? null}
                              title={plotSceneTitle(scene, tPlot('unnamedScene'))}
                              unnamedLine={tPlot('unnamedLine')}
                            />
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
