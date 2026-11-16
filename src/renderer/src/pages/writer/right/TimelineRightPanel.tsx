import { Fragment, type ReactElement, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { LoadErrorState } from '../../../components/LoadErrorState'
import { plainTextToDocJson } from '../../../../../shared/richTextDoc'
import { EntityReadonlyRichText } from '../entities/EntityReadonlyRichText'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import { plotSceneTime, plotSceneTitle, type PlotSceneRow } from '../plot/plotTree'
import { usePlotSceneContent, type PlotSceneContent } from '../plot/usePlotSceneContent'
import TimelineOriginPanel from '../timeline/TimelineOriginPanel'
import type { TimelineOriginPatch } from '../timeline/useTimelineWorkspace'

/** 独立时间线右栏的选中场景区（只读：卡头卡标题 + 时间、内容卡只读正文）。 */
function TimelineSceneDetail({
  scene,
  content,
  error,
  onRetry,
  bookId,
  hoverCard
}: {
  scene: PlotSceneRow | null
  /** 已加载到的正文（列表行不含正文；null = 未就绪，显示加载占位而非空正文）。 */
  content: PlotSceneContent | null
  /** 正文读取失败（显示错误 + 重试，不冒充空正文）。 */
  error: boolean
  onRetry: () => void
  bookId: string
  hoverCard: boolean
}): ReactElement {
  const { t } = useTranslation('plot')
  const { t: tTimeline } = useTranslation('timeline')
  const { t: tCommon } = useTranslation('common')
  if (scene === null) {
    return (
      <EmptyState compact title={t('editor.emptySelect')} description={tTimeline('readonlyNote')} />
    )
  }
  const eraLabels = {
    bc: t('timeEra.bc'),
    zero: t('timeEra.zero'),
    ad: t('timeEra.ad'),
    yearUnit: t('timeYearUnit')
  }
  // 正文以块级 JSON 为准；老数据 `descriptionJson` 为空（null / ''）时按派生纯文本兜底，
  // 转换复用共享纯函数（§9），避免在组件里重复实现。
  const bodyJson =
    content === null
      ? null
      : typeof content.descriptionJson === 'string' && content.descriptionJson.trim() !== ''
        ? content.descriptionJson
        : content.description.trim() !== ''
          ? plainTextToDocJson(content.description)
          : null
  return (
    // key 挂在 Fragment 上：切场景时卡头卡与内容卡一起重建，进场动画一起重播。
    <Fragment key={scene.id}>
      <section className="timeline-card timeline-scene-head">
        {/* 卡头透明（不套 `.wf-readonly-block` 值块），标题 + 时间落在卡片软底上。 */}
        <div className="timeline-card__head">
          <span className="timeline-card__title">{plotSceneTitle(scene, t('unnamedScene'))}</span>
          {/* 时间弱化在卡头右侧（不再单列一个字段），窄栏下允许换行。 */}
          <span className="timeline-card__meta">
            {plotSceneTime(scene, t('undatedScene'), eraLabels)}
          </span>
        </div>
      </section>
      {/* 内容卡：正文直接铺在卡片软底上，不再套 `.wf-readonly-block` 值块
          （空正文由组件统一显示占位）。 */}
      <section className="timeline-card timeline-scene-detail">
        <div className="timeline-detail__section">
          {error ? (
            // 读取失败：明确错误 + 重试，绝不显示成「正文为空」。
            <LoadErrorState compact onRetry={onRetry} />
          ) : content === null ? (
            // 正文未就绪：加载占位（不渲染只读正文，避免空正文占位误导）。
            <EmptyState compact title={tCommon('loading')} />
          ) : (
            <EntityReadonlyRichText
              key={bookId}
              bookId={bookId}
              json={bodyJson}
              emptyText={tTimeline('sceneBodyEmpty')}
              hoverCard={hoverCard}
            />
          )}
        </div>
      </section>
    </Fragment>
  )
}

export interface TimelineRightPanelProps {
  /** 书籍 id；起点卡按书键读取 `timeline:list:<bookId>`。 */
  bookId?: string
  /** 当前选中时间线 id；切换时起点卡重新加载对应条目。 */
  activeTimelineId?: string | null
  /** 是否为前台模块（`module === 'timeline'`）：为假时不读取场景正文，避免常驻右栏空拉。 */
  active?: boolean
  /** 保存起点补丁（页面层 `useTimelineWorkspace.updateOrigin`；名字 + 描述一次落库）。 */
  onUpdateOrigin: (patch: TimelineOriginPatch) => Promise<boolean>
  /** 关闭前统一 flush 入口（起点卡挂载时写入；页面层聚合调用）。 */
  flushRef?: RefObject<(() => Promise<void>) | null>
  /** 时间线选中场景（只读详情）；null = 未选中场景（originSelected 为 false 时渲染空态）。 */
  scene: PlotSceneRow | null
  /** 是否选中元年卡：true = 右栏只渲染起点编辑卡。 */
  originSelected?: boolean
}

/**
 * 独立时间线右栏内容：按选中项只渲染**一组卡**（卡头卡 + 内容卡）——选中起点时渲染起点区；
 * 选中场景时渲染该场景的只读区；两者都没选（场景已删 / 显式清空）时由
 * `TimelineSceneDetail` 的 null 分支渲染现有空态。
 *
 * 场景正文按需读取（列表行已投影掉 `descriptionJson`）：选中场景且本模块在前台时经
 * `usePlotSceneContent` 读取；加载中 / 失败分别显示占位与错误 + 重试，不冒充空正文。
 */
export function TimelineRightPanel({
  bookId,
  activeTimelineId,
  active = true,
  onUpdateOrigin,
  flushRef,
  scene,
  originSelected = false
}: TimelineRightPanelProps): ReactElement {
  // 实体悬停卡：起点卡与场景详情共用根容器上的一个控制器（子字段传 `hoverCard={false}`）。
  const entityHover = useEntityHover()
  const { content, error, reload } = usePlotSceneContent(
    scene?.id ?? null,
    active && !originSelected
  )
  return (
    <div
      className="rp-body rp-body--no-head"
      onMouseOver={entityHover.onMouseOver}
      onMouseLeave={entityHover.onMouseLeave}
    >
      {originSelected ? (
        <TimelineOriginPanel
          key={`${bookId ?? ''}:${activeTimelineId ?? ''}`}
          bookId={bookId}
          hoverCard={false}
          activeTimelineId={activeTimelineId}
          onSaveOrigin={onUpdateOrigin}
          flushRef={flushRef}
        />
      ) : (
        <TimelineSceneDetail
          scene={scene}
          content={content}
          error={error}
          onRetry={reload}
          bookId={bookId ?? ''}
          hoverCard={false}
        />
      )}
      <HoverCard
        anchor={entityHover.anchor}
        onClose={entityHover.close}
        onPointerEnter={entityHover.cancelHide}
        onPointerLeave={entityHover.onMouseLeave}
      />
    </div>
  )
}

export default TimelineRightPanel
