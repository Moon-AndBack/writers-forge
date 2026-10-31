import { useEffect, useRef } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import '../../styles/components/overlay.css'

export type DrawerSide = 'left' | 'right'

export interface DrawerProps {
  /** 是否显示 */
  open: boolean
  /** 关闭回调（遮罩 / Esc / 关闭按钮触发） */
  onClose: () => void
  /** 滑出方向，默认 right */
  side?: DrawerSide
  /** 面板宽度，数字按 px 处理，默认 400px（样式表值） */
  size?: number | string
  /** 标题，提供后渲染头部 */
  title?: ReactNode
  /** 底部内容 */
  footer?: ReactNode
  /** 点击遮罩是否关闭，默认 true */
  closeOnMask?: boolean
  /** 按 Esc 是否关闭，默认 true */
  closeOnEsc?: boolean
  /** 是否显示关闭按钮，默认 true */
  showClose?: boolean
  /** 关闭按钮的无障碍标签，缺省用 common.close */
  closeLabel?: string
  /** 对话框无障碍名称（无可见标题时使用） */
  ariaLabel?: string
  /** 透传到面板的 className */
  panelClassName?: string
  children?: ReactNode
}

export function Drawer({
  open,
  onClose,
  side = 'right',
  size,
  title,
  footer,
  closeOnMask = true,
  closeOnEsc = true,
  showClose = true,
  closeLabel,
  ariaLabel,
  panelClassName,
  children
}: DrawerProps) {
  const { t } = useTranslation('common')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEsc && event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, closeOnEsc, onClose])

  if (!open || typeof document === 'undefined') return null

  const handleMaskClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnMask && event.target === event.currentTarget) onClose()
  }

  const width = typeof size === 'number' ? `${size}px` : size
  const panelClasses = ['wf-drawer__panel', `wf-drawer__panel--${side}`, panelClassName ?? '']
    .filter(Boolean)
    .join(' ')

  const hasHead = title !== undefined || showClose

  return createPortal(
    <div className="wf-drawer">
      <div className="wf-drawer__mask" onClick={handleMaskClick} />
      <div
        ref={panelRef}
        className={panelClasses}
        style={width ? { width } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {hasHead ? (
          <div className="wf-drawer__head">
            <div className="wf-drawer__title">{title}</div>
            {showClose ? (
              <button
                type="button"
                className="wf-drawer__close"
                aria-label={closeLabel ?? t('close')}
                onClick={onClose}
              >
                ×
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="wf-drawer__body">{children}</div>
        {footer !== undefined ? <div className="wf-drawer__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

Drawer.displayName = 'Drawer'

export default Drawer
