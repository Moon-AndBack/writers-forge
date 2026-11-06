import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import ReadonlyRichText from '../../../components/editor/ReadonlyRichText'
import { plainTextToDocJson } from '../../../../../shared/richTextDoc'
import { plotSceneTime, plotSceneTitle, type PlotSceneRow } from '../plot/plotTree'
import TimelineOriginPanel from '../timeline/TimelineOriginPanel'

/** 独立时间线右栏的选中场景详情卡（只读：卡头标题 + 时间、只读正文）。 */
function TimelineSceneDetail({ scene }: { scene: PlotSceneRow | null }): ReactElement {
  const { t } = useTranslation('plot')
  const { t: tTimeline } = useTranslation('timeline')
  if (scene === null) {
    return (
      <div className="placeholder-view is-compact" role="note">
        <div className="placeholder-title">{t('editor.emptySelect')}</div>
        <div className="placeholder-desc">{tTimeline('readonlyNote')}</div>
      </div>
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
    // key 随选中场景变化：同一个 `<section>` 复用时只换文本不会重播进场动画，按场景重建即可。
    <section key={scene.id} className="timeline-card timeline-scene-detail">
      <div className="timeline-card__head">
        <span className="timeline-card__title">{plotSceneTitle(scene, t('unnamedScene'))}</span>
        {/* 时间弱化在卡头右侧（不再单列一个字段），窄栏下允许换行。 */}
        <span className="timeline-card__meta">
          {plotSceneTime(scene, t('undatedScene'), eraLabels)}
        </span>
      </div>
      {/* 正文区：只读富文本正文（空正文由组件统一显示占位），值块复用共享
          `.wf-readonly-block`（--control-on-soft 底 + 内描边），与伏笔只读详情同口径。 */}
      <div className="timeline-detail__section">
        <ReadonlyRichText
          json={bodyJson}
          emptyText={tTimeline('sceneBodyEmpty')}
          className="wf-readonly-block"
        />
      </div>
    </section>
  )
}

export interface TimelineRightPanelProps {
  /** 书籍 id；起点卡按书键读取 `timeline:list:<bookId>`。 */
  bookId?: string
  /** 当前选中时间线 id；切换时起点卡重新加载对应条目。 */
  activeTimelineId?: string | null
  /** 写回当前选中时间线的起点描述（页面层 `useTimelineWorkspace.updateDescription`）。 */
  onUpdateDescription: (description: string) => Promise<boolean>
  /** 时间线选中场景（只读详情）；null = 未选中（渲染空态）。 */
  scene: PlotSceneRow | null
}

/** 独立时间线右栏内容：起点卡（编辑起点描述 + 保存）+ 选中场景的只读详情卡。 */
export function TimelineRightPanel({
  bookId,
  activeTimelineId,
  onUpdateDescription,
  scene
}: TimelineRightPanelProps): ReactElement {
  return (
    <div className="rp-body rp-body--no-head">
      <TimelineOriginPanel
        key={`${bookId ?? ''}:${activeTimelineId ?? ''}`}
        bookId={bookId}
        activeTimelineId={activeTimelineId}
        onSaveDescription={onUpdateDescription}
      />
      <TimelineSceneDetail scene={scene} />
    </div>
  )
}

export default TimelineRightPanel
