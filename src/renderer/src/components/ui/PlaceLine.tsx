/**
 * 单行「位置」行（通用共享组件：伏笔埋点 / 回收位置、实体首次登场等共用）。
 *
 * 结构：左侧固定标签 + 右侧单行截断值。tooltip 挂在**值元素**而非整行：
 * 截断（`text-overflow: ellipsis`）只发生在值上，悬停左侧标签不应弹出位置；
 * 且锚点宽就是值本身，浮层水平居中更贴合被截断的文本。
 * 弱化态（占位 / 未登场）不给 `content`，`useTooltip` 即不显示浮层。
 * 无障碍：值文本在 DOM 中始终完整（省略号只是视觉裁剪），读屏本就能取到全值；
 * 另由 `anchorProps` 附带 `aria-describedby`（指向浮层），与项目其它 tooltip 同口径。
 *
 * 样式见 `styles/components/place-line.css`（AGENTS §9：不复制第二套位置行样式）。
 */
import { useTooltip } from './Tooltip'

export interface PlaceLineProps {
  /** 左侧固定标签。 */
  label: string
  /** 右侧值（单行截断，完整文本始终保留在 DOM）。 */
  value: string
  /** tooltip 文本：缺省取 `value`；传空串可关闭 tooltip。 */
  title?: string
  /** 显示语气：`normal` 正常值；`muted` 占位 / 未登场（弱化色，不弹 tooltip）。 */
  tone?: 'normal' | 'muted'
}

/** 单行位置行：标签 + 单行截断值（+ 可选 tooltip）。 */
export function PlaceLine({ label, value, title, tone = 'normal' }: PlaceLineProps) {
  const muted = tone === 'muted'
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLSpanElement>({
    content: muted ? '' : (title ?? value),
    placement: 'top'
  })

  return (
    <>
      {tooltip}
      <div className="wf-place-line">
        <span className="wf-place-line__label">{label}</span>
        <span
          ref={anchorRef}
          {...anchorProps}
          className={`wf-place-line__value${muted ? ' is-muted' : ''}`}
        >
          {value}
        </span>
      </div>
    </>
  )
}

export default PlaceLine
