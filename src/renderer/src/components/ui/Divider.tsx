import type { HTMLAttributes } from 'react'
import '../../styles/components/surface.css'

export type DividerOrientation = 'horizontal' | 'vertical'

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  /** 方向，默认 horizontal */
  orientation?: DividerOrientation
}

export function Divider({ orientation = 'horizontal', className, ...rest }: DividerProps) {
  const classes = ['wf-divider', `wf-divider--${orientation}`, className ?? '']
    .filter(Boolean)
    .join(' ')

  return <div role="separator" aria-orientation={orientation} className={classes} {...rest} />
}

Divider.displayName = 'Divider'

export default Divider
