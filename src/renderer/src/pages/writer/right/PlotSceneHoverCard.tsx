import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { HoverPopupShell } from '../../../components/HoverPopupShell'
import type { PlotSceneRow } from '../plot/plotTree'

/** 悬停锚点：场景 + 触发卡片（活元素，滚动 / 缩放时重测）。 */
export interface PlotHoverAnchor {
  scene: PlotSceneRow
  /** 触发悬停的卡片按钮（滚动或列表重排后按其最新视口矩形重定位）。 */
  el: HTMLElement
  /** 悬停瞬间的视口矩形（活元素断开时的兜底）。 */
  rect: DOMRect
  title: string
  timeLabel: string
}

export interface PlotSceneHoverCardProps {
  anchor: PlotHoverAnchor | null
}

/**
 * 剧情卡片悬停浮窗：场景标题 + 时间 + **全部正文**（`description`，保留换行）。
 *
 * - 定位复用 `computeCardPosition(..., 'right')`：优先贴卡片右侧，右侧放不下改放下方 /
 *   上翻并夹紧视口；
 * - `max-height: 60vh` + 内部纵向滚动，长正文不撑破视口；
 * - `pointer-events: none`（不挡鼠标，移出卡片由调用方延迟关闭），淡入仅 opacity（禁 transform）。
 */
export function PlotSceneHoverCard({ anchor }: PlotSceneHoverCardProps): ReactElement | null {
  const { t } = useTranslation('writer')

  if (!anchor) return null

  const body = anchor.scene.description.trim() !== '' ? anchor.scene.description : null

  // portal 到 body：右栏祖先的 overflow / 动效可能裁剪或改变 fixed 包含块。
  // 定位由 HoverPopupShell 统一负责（实测尺寸 → 写样式，`right` 方向）；`pointer-events: none`
  // 仍由 `.rp-plot-hover` 的 CSS 声明，Shell 不重复设置。
  return (
    <HoverPopupShell
      anchorRect={anchor.rect}
      anchorEl={anchor.el}
      placement="right"
      className="rp-plot-hover"
    >
      <div className="rp-plot-hover__head">
        <span className="rp-plot-hover__title">{anchor.title}</span>
        <span className="rp-plot-hover__meta">{anchor.timeLabel}</span>
      </div>
      <div className="rp-plot-hover__body">
        {body ?? <span className="rp-plot-hover__empty">{t('rightPlot.hoverEmpty')}</span>}
      </div>
    </HoverPopupShell>
  )
}

export default PlotSceneHoverCard
