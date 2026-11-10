import { Fragment, type ReactElement, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import { plainTextToDocJson } from '../../../../../shared/richTextDoc'
import { EntityReadonlyRichText } from '../entities/EntityReadonlyRichText'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import { plotSceneTime, plotSceneTitle, type PlotSceneRow } from '../plot/plotTree'
import TimelineOriginPanel from '../timeline/TimelineOriginPanel'

/** 独立时间线右栏的选中场景区（只读：卡头卡标题 + 时间、内容卡只读正文）。 */
function TimelineSceneDetail({
  scene,
  bookId,
  hoverCard
}: {
  scene: PlotSceneRow | null
  bookId: string
  hoverCard: boolean
}): ReactElement {
  const { t } = useTranslation('plot')
  const { t: tTimeline } = useTranslation('timeline')
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
    typeof scene.descriptionJson === 'string' && scene.descriptionJson.trim() !== ''
      ? scene.descriptionJson
      : scene.description.trim() !== ''
        ? plainTextToDocJson(scene.description)
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
      {/* 内容卡：正文区只读富文本正文（空正文由组件统一显示占位），值块复用共享
          `.wf-readonly-block`（--control-on-soft 底 + 内描边），与伏笔只读详情同口径。 */}
      <section className="timeline-card timeline-scene-detail">
        <div className="timeline-detail__section">
          <EntityReadonlyRichText
            key={bookId}
            bookId={bookId}
            json={bodyJson}
            emptyText={tTimeline('sceneBodyEmpty')}
            className="wf-readonly-block"
            hoverCard={hoverCard}
          />
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
  /** 写回当前选中时间线的起点描述（页面层 `useTimelineWorkspace.updateDescription`，入参为编辑器归一值）。 */
  onUpdateDescription: (value: RichTextBodyValue) => Promise<boolean>
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
 */
export function TimelineRightPanel({
  bookId,
  activeTimelineId,
  onUpdateDescription,
  flushRef,
  scene,
  originSelected = false
}: TimelineRightPanelProps): ReactElement {
  // 实体悬停卡：起点卡与场景详情共用根容器上的一个控制器（子字段传 `hoverCard={false}`）。
  const entityHover = useEntityHover()
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
          onSaveDescription={onUpdateDescription}
          flushRef={flushRef}
        />
      ) : (
        <TimelineSceneDetail scene={scene} bookId={bookId ?? ''} hoverCard={false} />
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
