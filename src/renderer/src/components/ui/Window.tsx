import { forwardRef } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import '../../styles/components/window.css'

/** 窗口宽度档位（与 Modal 尺寸对齐）：sm 360 / md 480 / lg 640 / xl 880。 */
export type WindowSize = 'sm' | 'md' | 'lg' | 'xl'

export interface WindowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 标题区内容，提供后渲染标题区（无标题但有关闭按钮时仍渲染标题区）。 */
  title?: ReactNode
  /** 关闭回调；提供后默认渲染右上角关闭按钮。 */
  onClose?: () => void
  /** 是否显示右上角关闭按钮，默认在提供 `onClose` 时显示。 */
  showClose?: boolean
  /** 关闭按钮的无障碍标签，缺省用 common.close。 */
  closeLabel?: string
  /** 底部操作区内容，提供后渲染底部区（含左右渐隐分隔线）。 */
  footer?: ReactNode
  /** 宽度档位；不传则不限制最大宽度。 */
  size?: WindowSize
  /** 透传到内容区的 className。 */
  bodyClassName?: string
}

/**
 * 窗口框架：标题区 + 可滚动内容区 + 底部操作区（带左右渐隐分隔线）。
 * `Modal` 与欢迎页共用同一外观，保证浮层与引导卡片风格一致。
 */
export const Window = forwardRef<HTMLDivElement, WindowProps>(function Window(
  {
    title,
    onClose,
    showClose,
    closeLabel,
    footer,
    size,
    className,
    bodyClassName,
    children,
    ...rest
  },
  ref
) {
  const { t } = useTranslation('common')
  const withClose = (showClose ?? true) && onClose !== undefined
  const hasHead = title !== undefined || withClose

  const classes = ['wf-window', size ? `wf-window--${size}` : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const bodyClasses = ['wf-window__body', bodyClassName ?? ''].filter(Boolean).join(' ')

  return (
    <div ref={ref} className={classes} {...rest}>
      {hasHead ? (
        <div className="wf-window__head">
          {title !== undefined ? <div className="wf-window__title">{title}</div> : null}
          {withClose ? (
            <button
              type="button"
              className="wf-window__close"
              aria-label={closeLabel ?? t('close')}
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={bodyClasses}>{children}</div>
      {footer !== undefined ? <div className="wf-window__footer">{footer}</div> : null}
    </div>
  )
})

Window.displayName = 'Window'

export default Window
