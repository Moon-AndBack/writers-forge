import type { KeyboardEvent, RefObject } from 'react'
import { cn } from '@renderer/lib/cn'
import type { TooltipAnchorProps } from '../components/ui/Tooltip'

export interface ActivityPillProps {
  /** 活动栏是否已展开（展开后胶囊隐藏，移出 Tab 序列）。 */
  shown: boolean
  /** 胶囊根节点（tooltip 锚点定位用）。 */
  pillRef: RefObject<HTMLDivElement | null>
  /** tooltip 锚点交互属性（`aria-describedby` 与 hover / focus 计时）。 */
  anchorProps: TooltipAnchorProps
  /** 无障碍名称（缺省 tooltip 只作描述，`div` 仍需显式名称）。 */
  label: string
  /** 指针移入：tooltip 锚点 + 由调用方延迟展开活动栏。 */
  onEnter: () => void
  /** 指针移出：由调用方判断指针是否仍在展开的活动栏上。 */
  onLeave: () => void
  /** 键盘展开（Enter / Space）：展开活动栏并把焦点交给首个模块按钮。 */
  onExpand: () => void
}

/**
 * 活动栏悬浮胶囊：活动栏收起时唯一可见入口，必须可键盘操作。
 * 展开后胶囊淡出（`.is-hidden`）且 `tabIndex=-1`，焦点由调用方转入活动栏。
 */
export function ActivityPill({
  shown,
  pillRef,
  anchorProps,
  label,
  onEnter,
  onLeave,
  onExpand
}: ActivityPillProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    // Space 默认滚动页面；胶囊的激活语义等同按钮，须阻止。
    event.preventDefault()
    onExpand()
  }

  return (
    <div
      ref={pillRef}
      className={cn('act-pill', shown && 'is-hidden')}
      role="button"
      tabIndex={shown ? -1 : 0}
      aria-label={label}
      aria-describedby={anchorProps['aria-describedby']}
      onMouseEnter={() => {
        anchorProps.onMouseEnter()
        onEnter()
      }}
      onMouseLeave={onLeave}
      onFocus={anchorProps.onFocus}
      onBlur={anchorProps.onBlur}
      onKeyDown={handleKeyDown}
    >
      <span />
      <span />
      <span />
    </div>
  )
}

export default ActivityPill
