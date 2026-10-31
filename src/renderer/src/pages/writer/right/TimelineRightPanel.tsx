import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import TimelineOriginPanel from '../timeline/TimelineOriginPanel'
import { plotSceneTime, plotSceneTitle, type PlotSceneRow } from '../plot/plotTree'

/** 独立时间线右栏选中场景详情（只读展示：起点仍由上方 `TimelineOriginPanel` 可编辑）。 */
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
  return (
    // key 随选中场景变化：同一 `<div>` 复用时只换文本不会重播进场动画，按场景重建即可。
    <div key={scene.id} className="plot-editor timeline-scene-detail pane-region">
      <div className="plot-editor-fields">
        <div className="plot-field">
          <span className="plot-field-label">{t('editor.fieldTitle')}</span>
          <div className="plot-scene-desc">{plotSceneTitle(scene, t('unnamedScene'))}</div>
        </div>
        <div className="plot-field">
          <span className="plot-field-label">{t('editor.fieldTime')}</span>
          <div className="plot-scene-desc">
            {plotSceneTime(scene, t('undatedScene'), eraLabels)}
          </div>
        </div>
        {scene.description.trim() !== '' ? (
          <div className="plot-field">
            <span className="plot-field-label">{t('editor.fieldContent')}</span>
            <div className="plot-scene-desc">{scene.description}</div>
          </div>
        ) : null}
      </div>
      <div className="plot-scene-desc">{tTimeline('readonlyNote')}</div>
    </div>
  )
}

export interface TimelineRightPanelProps {
  /** 书籍 id（时间线起点按书键读写）。 */
  bookId?: string
  /** 时间线选中场景（只读详情）；null = 未选中（渲染空态）。 */
  scene: PlotSceneRow | null
  /** 当前选中时间线 id（右栏 origin 面板跟随切换）。 */
  activeTimelineId: string | null
  /** origin 保存成功后回调（供页面层同步中栏显示）。 */
  onOriginChange?: (origin: string) => void
}

/** 独立时间线右栏内容：起点说明 + 可编辑起点 + 选中场景只读详情（保持原样）。 */
export function TimelineRightPanel({
  bookId,
  scene,
  activeTimelineId,
  onOriginChange
}: TimelineRightPanelProps): ReactElement {
  return (
    <div className="rp-body">
      <TimelineOriginPanel
        bookId={bookId}
        activeTimelineId={activeTimelineId}
        onOriginChange={onOriginChange}
      />
      <TimelineSceneDetail scene={scene} />
    </div>
  )
}

export default TimelineRightPanel
