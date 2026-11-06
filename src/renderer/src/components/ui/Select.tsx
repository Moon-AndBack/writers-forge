import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/cn'
import '../../styles/components/form.css'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  /** 当前值（受控） */
  value?: string
  /** 选中回调，回传选项 value */
  onChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  /** 控件尺寸，默认 md */
  size?: 'sm' | 'md' | 'lg'
  /** 错误态：写入 aria-invalid 并附加 is-invalid */
  invalid?: boolean
  /** 触发按钮 id（同时用于派生 listbox / option 的 id） */
  id?: string
  /** 原生表单字段名；提供时渲染同名隐藏 input 以便表单提交 */
  name?: string
  /** 无可见标签时提供给无障碍 */
  ariaLabel?: string
  /** 面板为空时的提示文案 */
  emptyText?: string
  className?: string
}

function sizeModifier(size: SelectProps['size']): string {
  return size && size !== 'md' ? `wf-select--${size}` : ''
}

/** 面板与触发器的间距（对齐原 form-select.css 的 top: calc(100% + 6px)） */
const PANEL_GAP = 6
/** 面板贴视口边缘时保留的留白 */
const PANEL_PAD = 8

export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  size,
  invalid = false,
  id,
  name,
  ariaLabel,
  emptyText,
  className
}: SelectProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // 面板已 portal 到 body 并改 position:fixed，坐标为视口坐标系（null 表示尚未测量）
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])

  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listboxId = `${triggerId}-listbox`

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value]
  )
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const firstEnabledIndex = useCallback(
    () => options.findIndex((option) => !option.disabled),
    [options]
  )

  const closePanel = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    setPos(null)
  }, [])

  const openPanel = useCallback(() => {
    if (disabled) return
    setOpen(true)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex())
  }, [disabled, selectedIndex, firstEnabledIndex])

  const moveActive = useCallback(
    (direction: 1 | -1) => {
      setActiveIndex((current) => {
        const count = options.length
        if (count === 0) return -1
        let next = current
        for (let step = 0; step < count; step += 1) {
          next = (next + direction + count) % count
          if (!options[next].disabled) return next
        }
        return current
      })
    },
    [options]
  )

  const commit = useCallback(
    (index: number) => {
      const option = options[index]
      if (!option || option.disabled) return
      onChange?.(option.value)
      closePanel()
    },
    [options, onChange, closePanel]
  )

  // 点击组件外部关闭（面板已 portal 到 body，故需同时检查触发器与面板引用）
  useEffect(() => {
    if (!open) return undefined
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      closePanel()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open, closePanel])

  // 定位：面板 portal 到 body 并改 position:fixed（逃逸 overflow 裁剪），以触发器矩形
  // 为锚——左对齐、同宽；下方空间不足时上翻；滚动 / 缩放时重算。
  useEffect(() => {
    if (!open) return undefined
    const reposition = (): void => {
      const trigger = rootRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      const width = rect.width
      const left = Math.min(
        Math.max(rect.left, PANEL_PAD),
        Math.max(PANEL_PAD, window.innerWidth - width - PANEL_PAD)
      )
      let top = rect.bottom + PANEL_GAP
      if (top + panelHeight > window.innerHeight - PANEL_PAD) {
        // 下方空间不足：上翻贴触发器上方（面板高于视口时夹取到顶部留白）。
        top = Math.max(PANEL_PAD, rect.top - PANEL_GAP - panelHeight)
      }
      setPos({ left, top, width })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  // 键盘高亮项滚动进可视区
  useEffect(() => {
    if (!open || activeIndex < 0) return
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        if (open) {
          moveActive(event.key === 'ArrowDown' ? 1 : -1)
        } else {
          openPanel()
        }
        break
      case 'Home':
        if (open) {
          event.preventDefault()
          setActiveIndex(firstEnabledIndex())
        }
        break
      case 'End':
        if (open) {
          event.preventDefault()
          setActiveIndex(options.length - 1)
        }
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        if (open) {
          commit(activeIndex)
        } else {
          openPanel()
        }
        break
      case 'Escape':
        if (open) {
          event.preventDefault()
          closePanel()
        }
        break
      case 'Tab':
        if (open) closePanel()
        break
      default:
        break
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'wf-select',
        sizeModifier(size),
        open && 'is-open',
        disabled && 'is-disabled',
        className
      )}
    >
      <button
        type="button"
        id={triggerId}
        className="wf-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
        aria-invalid={invalid ? true : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={cn('wf-select__value', !selected && 'is-placeholder')}>
          {selected ? selected.label : (placeholder ?? t('selectPlaceholder'))}
        </span>
        <span className="wf-select__caret" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {name ? <input type="hidden" name={name} value={value ?? ''} /> : null}

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              className="wf-select__panel"
              role="listbox"
              id={listboxId}
              aria-label={ariaLabel}
              style={{
                left: `${pos?.left ?? 0}px`,
                top: `${pos?.top ?? 0}px`,
                width: pos ? `${pos.width}px` : undefined,
                visibility: pos ? 'visible' : 'hidden'
              }}
            >
              {options.length === 0 ? (
                <div className="wf-select__empty">{emptyText ?? t('noOptions')}</div>
              ) : (
                options.map((option, index) => {
                  const isSelected = option.value === value
                  return (
                    <div
                      key={option.value}
                      id={`${listboxId}-opt-${index}`}
                      ref={(element) => {
                        optionRefs.current[index] = element
                      }}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      className={cn(
                        'wf-select__option',
                        isSelected && 'is-selected',
                        index === activeIndex && 'is-active',
                        option.disabled && 'is-disabled'
                      )}
                      onMouseEnter={() => {
                        if (!option.disabled) setActiveIndex(index)
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commit(index)}
                    >
                      <span className="wf-select__option-label">{option.label}</span>
                      {isSelected ? (
                        <span className="wf-select__check" aria-hidden="true">
                          ✓
                        </span>
                      ) : null}
                    </div>
                  )
                })
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

Select.displayName = 'Select'
