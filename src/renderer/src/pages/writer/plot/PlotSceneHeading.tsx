import type { ReactElement } from 'react'
import {
  getPlotLineColorValue,
  normalizePlotLineColor,
  plotLineLabel,
  type PlotLineRow
} from './plotTree'

export interface PlotSceneHeadingProps {
  /** 场景标题（调用方已按空名回退占位）。 */
  title: string
  /** 来源剧情线；缺省 / null 时不渲染标签，仅输出裸标题。 */
  line?: PlotLineRow | null
  /** 空线名占位（调用方经 `t('unnamedLine')` 提供，不硬编码）。 */
  unnamedLine: string
}

/**
 * 剧情卡标题行：可选「来源剧情线标签 + 场景标题」。
 *
 * 跨线聚合场景（独立时间线模块 / 右栏「全部剧情线」）需标明场景来源线；
 * 单线场景不传 `line`，输出与旧版裸 `<h3>` 完全一致（零视觉回归）。
 *
 * 结构 / 配色与 `TimelineView` 原内联实现逐字对齐（AGENTS §9：两处同构上提共享，
 * 避免右栏再复制一份标签 + 标题结构）。
 */
export function PlotSceneHeading({
  title,
  line = null,
  unnamedLine
}: PlotSceneHeadingProps): ReactElement {
  const heading = <h3 className="wf-entity-card__title plot-scene-title">{title}</h3>
  if (!line) return heading
  // 来源线标签：按该线配置色着色（非法 key 归一回退首色）。
  const tagColor = getPlotLineColorValue(normalizePlotLineColor(line.lineColor))
  return (
    <div className="plot-scene-heading">
      <span className="plot-line-tag" style={{ color: tagColor, backgroundColor: `${tagColor}1f` }}>
        {plotLineLabel(line, unnamedLine)}
      </span>
      {heading}
    </div>
  )
}

export default PlotSceneHeading
