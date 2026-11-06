import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'
import '../../styles/components/overlay.css'

/** 下拉菜单项：普通项或分隔线 */
export interface DropdownItem {
  /** 唯一 key */
  key: string
  /** 显示内容 */
  label?: ReactNode
  /** 前置图标 */
  icon?: ReactNode
  /** 是否禁用 */
  disabled?: boolean
  /** 勾选态：为 true 时显示 ✓ 并高亮；提供该字段的项以 menuitemcheckbox 语义渲染 */
  checked?: boolean
  /** 选中回调 */
  onSelect?: () => void
  /** 渲染为分隔线（忽略其余字段） */
  separator?: boolean
}

export type DropdownAlign = 'start' | 'end'

export interface DropdownTriggerState {
  open: boolean
}

export interface DropdownProps {
  /** 触发器：节点或渲染函数（函数可读取展开状态） */
  trigger: ReactNode | ((state: DropdownTriggerState) => ReactNode)
  /** 菜单项列表 */
  items: DropdownItem[]
  /** 菜单对齐方向，默认 start（贴左） */
  align?: DropdownAlign
  /** 是否禁用整个下拉 */
  disabled?: boolean
  /** 透传到根节点的 className */
  className?: string
  /** 展开状态变化回调 */
  onOpenChange?: (open: boolean) => void
}

function isSelectable(item: DropdownItem | undefined): boolean {
  return Boolean(item) && !item?.separator && !item?.disabled
}

function findNextEnabled(items: DropdownItem[], from: number, direction: 1 | -1): number {
  const count = items.length
  if (count === 0) return -1
  let index = from
  for (let step = 0; step < count; step += 1) {
    index = (index + direction + count) % count
    if (isSelectable(items[index])) return index
  }
  return -1
}

export function Dropdown({
  trigger,
  items,
  align = 'start',
  disabled = false,
  className,
  onOpenChange
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  /** 仅在键盘导航时把焦点移入菜单项，鼠标悬停只做高亮 */
  const keyboardNav = useRef(false)

  const closeMenu = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    keyboardNav.current = false
    onOpenChange?.(false)
  }, [onOpenChange])

  const openMenu = useCallback(
    (focusFirst: boolean) => {
      if (disabled) return
      setOpen(true)
      keyboardNav.current = focusFirst
      setActiveIndex(focusFirst ? findNextEnabled(items, -1, 1) : -1)
      onOpenChange?.(true)
    },
    [disabled, items, onOpenChange]
  )

  const commit = useCallback(
    (index: number) => {
      const item = items[index]
      if (!isSelectable(item)) return
      item.onSelect?.()
      closeMenu()
    },
    [items, closeMenu]
  )

  // 点击组件外部关闭
  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, closeMenu])

  // 键盘导航时把焦点移到高亮项
  useEffect(() => {
    if (!open || activeIndex < 0 || !keyboardNav.current) return
    itemRefs.current[activeIndex]?.focus()
  }, [open, activeIndex])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        if (!open) {
          openMenu(true)
        } else {
          keyboardNav.current = true
          setActiveIndex((current) => findNextEnabled(items, current, direction))
        }
        break
      }
      case 'Home':
        if (open) {
          event.preventDefault()
          keyboardNav.current = true
          setActiveIndex(findNextEnabled(items, -1, 1))
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          keyboardNav.current = true
          setActiveIndex(findNextEnabled(items, items.length, -1))
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (!open) {
          openMenu(true)
        } else if (activeIndex >= 0) {
          commit(activeIndex)
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          closeMenu()
        }
        break
      case 'Tab':
        if (open) closeMenu()
        break
      default:
        break
    }
  }

  const triggerNode = typeof trigger === 'function' ? trigger({ open }) : trigger

  return (
    <div
      ref={rootRef}
      className={cn('wf-dropdown', open && 'is-open', disabled && 'is-disabled', className)}
      onKeyDown={handleKeyDown}
    >
      <span
        className="wf-dropdown__trigger"
        onClick={() => {
          if (disabled) return
          if (open) closeMenu()
          else openMenu(false)
        }}
      >
        {triggerNode}
      </span>

      {open ? (
        <div
          className={cn(
            'wf-dropdown__menu',
            align === 'end' ? 'wf-dropdown__menu--end' : 'wf-dropdown__menu--start'
          )}
          role="menu"
        >
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={item.key} className="wf-dropdown__sep" role="separator" />
            }
            const checkable = item.checked !== undefined
            return (
              <button
                key={item.key}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                type="button"
                role={checkable ? 'menuitemcheckbox' : 'menuitem'}
                className={cn(
                  'wf-dropdown__item',
                  index === activeIndex && 'is-active',
                  item.checked && 'is-checked',
                  item.disabled && 'is-disabled'
                )}
                disabled={item.disabled}
                aria-checked={checkable ? item.checked : undefined}
                onMouseEnter={() => {
                  if (isSelectable(item)) {
                    keyboardNav.current = false
                    setActiveIndex(index)
                  }
                }}
                onClick={() => commit(index)}
              >
                {item.icon ? (
                  <span className="wf-dropdown__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                ) : null}
                <span className="wf-dropdown__label">{item.label}</span>
                <span className="wf-dropdown__check" aria-hidden="true">
                  ✓
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

Dropdown.displayName = 'Dropdown'

export default Dropdown
