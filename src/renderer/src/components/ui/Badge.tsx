import type { HTMLAttributes, ReactNode } from 'react'
import '../../styles/components/surface.css'

export type BadgeTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 色调，默认 neutral */
  tone?: BadgeTone
  /** 是否在文案前显示状态点 */
  dot?: boolean
  /** 计数，提供后优先于 children 渲染 */
  count?: number
  /** 计数上限，超出显示 `${max}+`，默认 99 */
  max?: number
  children?: ReactNode
}

export function Badge({
  tone = 'neutral',
  dot = false,
  count,
  max = 99,
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = ['wf-badge', `wf-badge--${tone}`, className ?? ''].filter(Boolean).join(' ')

  const content: ReactNode = count !== undefined ? (count > max ? `${max}+` : count) : children

  return (
    <span className={classes} {...rest}>
      {dot ? <span className="wf-badge__dot" aria-hidden="true" /> : null}
      {content !== undefined && content !== null ? (
        <span className="wf-badge__text">{content}</span>
      ) : null}
    </span>
  )
}

Badge.displayName = 'Badge'

export default Badge
