import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import '../../styles/components/display-extras.css'

export interface AccordionItemData {
  /** 唯一标识。 */
  key: string
  /** 标题内容。 */
  title: ReactNode
  /** 展开后显示的内容。 */
  content: ReactNode
  /** 非受控模式下的默认展开态。 */
  defaultOpen?: boolean
  /** 是否禁用该项。 */
  disabled?: boolean
}

export interface AccordionProps {
  /** 面板项列表。 */
  items: ReadonlyArray<AccordionItemData>
  /** 受控展开的 key 列表；提供后为受控模式。 */
  openKeys?: ReadonlyArray<string>
  /** 非受控模式下的初始展开 key 列表。 */
  defaultOpenKeys?: ReadonlyArray<string>
  /** 展开/收起回调。 */
  onToggle?: (key: string, open: boolean) => void
  /** 是否可同时展开多项，默认 true（仅非受控模式生效）。 */
  multiple?: boolean
  /** 合并到根节点的类名。 */
  className?: string
  /** 无障碍名称。 */
  'aria-label'?: string
}

function buildInitialOpen(
  items: ReadonlyArray<AccordionItemData>,
  defaultOpenKeys?: ReadonlyArray<string>
): Set<string> {
  const open = new Set<string>(defaultOpenKeys ?? [])
  items.forEach((item) => {
    if (item.defaultOpen) open.add(item.key)
  })
  return open
}

/**
 * 折叠面板（本域额外控件）。
 * 原型：template/index.html 的 .vol / .vol-head / .vol-arrow / .chapters；
 * 箭头展开时旋转 90°，内容区用 grid-template-rows 0fr→1fr 配合透明度过渡。
 * 支持非受控（defaultOpen / defaultOpenKeys）与受控（openKeys + onToggle）两种用法。
 */
export function Accordion({
  items,
  openKeys,
  defaultOpenKeys,
  onToggle,
  multiple = true,
  className,
  'aria-label': ariaLabel
}: AccordionProps) {
  const baseId = useId()
  const [internalOpen, setInternalOpen] = useState<Set<string>>(() =>
    buildInitialOpen(items, defaultOpenKeys)
  )
  const controlled = openKeys !== undefined
  const open = openKeys !== undefined ? new Set(openKeys) : internalOpen

  const classes = ['wf-accordion', className ?? ''].filter(Boolean).join(' ')

  const handleToggle = (item: AccordionItemData) => {
    if (item.disabled) return
    const willOpen = !open.has(item.key)
    onToggle?.(item.key, willOpen)
    if (controlled) return
    setInternalOpen((prev) => {
      const next = new Set(prev)
      if (willOpen) {
        if (!multiple) next.clear()
        next.add(item.key)
      } else {
        next.delete(item.key)
      }
      return next
    })
  }

  return (
    <div className={classes} aria-label={ariaLabel}>
      {items.map((item, index) => {
        const isOpen = open.has(item.key)
        const bodyId = `${baseId}-body-${index}`
        const titleId = `${baseId}-title-${index}`
        const itemClasses = [
          'wf-accordion__item',
          isOpen ? 'is-open' : '',
          item.disabled ? 'is-disabled' : ''
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <div key={item.key} className={itemClasses}>
            <button
              type="button"
              className="wf-accordion__head"
              aria-expanded={isOpen}
              aria-controls={bodyId}
              disabled={item.disabled}
              onClick={() => handleToggle(item)}
            >
              <span className="wf-accordion__arrow" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
              <span className="wf-accordion__title" id={titleId}>
                {item.title}
              </span>
            </button>
            <div className="wf-accordion__body" id={bodyId} role="region" aria-labelledby={titleId}>
              <div className="wf-accordion__body-inner">
                <div className="wf-accordion__content">{item.content}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

Accordion.displayName = 'Accordion'

export default Accordion
