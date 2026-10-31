import type { HTMLAttributes } from 'react'
import '../../styles/components/surface.css'

export type ProgressTone = 'brand' | 'ok' | 'warn' | 'danger'
export type ProgressSize = 'sm' | 'md' | 'lg'

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 当前值，默认 0 */
  value?: number
  /** 最大值，默认 100 */
  max?: number
  /** 色调，默认 brand */
  tone?: ProgressTone
  /** 高度，默认 md（4px） */
  size?: ProgressSize
  /** 无障碍标签 */
  label?: string
}

export function Progress({
  value = 0,
  max = 100,
  tone = 'brand',
  size = 'md',
  label,
  className,
  ...rest
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100
  const clamped = Math.min(Math.max(value, 0), safeMax)
  const percent = (clamped / safeMax) * 100

  const classes = ['wf-progress', `wf-progress--${size}`, className ?? ''].filter(Boolean).join(' ')

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      className={classes}
      {...rest}
    >
      <span
        className={`wf-progress__bar wf-progress__bar--${tone}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

Progress.displayName = 'Progress'

export default Progress
