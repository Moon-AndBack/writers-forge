import type { HTMLAttributes, ReactNode } from 'react'
import '../../styles/components/surface.css'

export type CardVariant = 'default' | 'soft'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 卡片标题，提供后渲染头部 */
  title?: ReactNode
  /** 标题下方副标题 */
  subtitle?: ReactNode
  /** 头部右侧附加内容（按钮、标签等） */
  extra?: ReactNode
  /** 底部内容，提供后渲染带分隔线的页脚 */
  footer?: ReactNode
  /** 视觉变体：default 为面板底，soft 为柔和底 */
  variant?: CardVariant
  /** 悬浮时轻微上浮，用于可点击卡片 */
  interactive?: boolean
  /** 透传到内容容器的 className */
  bodyClassName?: string
}

export function Card({
  title,
  subtitle,
  extra,
  footer,
  variant = 'default',
  interactive = false,
  className,
  bodyClassName,
  children,
  ...rest
}: CardProps) {
  const hasHead = title !== undefined || subtitle !== undefined || extra !== undefined

  const classes = [
    'wf-card',
    variant === 'soft' ? 'wf-card--soft' : '',
    interactive ? 'wf-card--interactive' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ')

  const bodyClasses = ['wf-card__body', bodyClassName ?? ''].filter(Boolean).join(' ')

  return (
    <div className={classes} {...rest}>
      {hasHead ? (
        <div className="wf-card__head">
          <div className="wf-card__titles">
            {title !== undefined ? <div className="wf-card__title">{title}</div> : null}
            {subtitle !== undefined ? <div className="wf-card__subtitle">{subtitle}</div> : null}
          </div>
          {extra !== undefined ? <div className="wf-card__extra">{extra}</div> : null}
        </div>
      ) : null}
      <div className={bodyClasses}>{children}</div>
      {footer !== undefined ? <div className="wf-card__footer">{footer}</div> : null}
    </div>
  )
}

Card.displayName = 'Card'

export default Card
