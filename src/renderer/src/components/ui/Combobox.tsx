import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import '../../styles/components/form.css'
export interface ComboboxOption {
  value: string
  label: string
}
export interface ComboboxProps {
  /** 候选列表（按 label 做包含匹配过滤，不区分大小写）。 */
  options: ComboboxOption[]
  /** 当前选中值（受控）。 */
  value?: string
  /** 选中回调；输入文本与已选 label 不一致时回传空串，避免保留失效选择。 */
  onChange?: (value: string) => void
  placeholder?: string
  /** 无可见标签时提供给无障碍。 */
  ariaLabel?: string
  /** 控件尺寸，默认 md。 */
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** 过滤后无候选时的提示文案。 */
  emptyText?: string
}
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
const PANEL_GAP = 6
const PANEL_PAD = 8
/**
 * 可搜索下拉组合框（通用组件，§9）：视觉复用 `Select` 的 `.wf-select` 系列
 * （触发器 / 面板 / 选项 / 空态），面板 portal 到 body + fixed 定位；输入按
 * label 包含匹配过滤，键盘 ↑↓ / Enter / Esc / Tab 与 Select 同口径；输入与
 * 已选 label 不一致时回调空串，避免保留失效选择。
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder,
  ariaLabel,
  size,
  disabled = false,
  emptyText
}: ComboboxProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [query, setQuery] = useState('')
  const [typing, setTyping] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<Array<HTMLDivElement | null>>([])
  const generatedId = useId()
  const listboxId = `${generatedId}-listbox`
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value])
  const selectedLabel = selected?.label ?? ''
  // 非输入态展示全量（聚焦先看全量），输入态按 label 包含匹配。
  const term = typing ? query.trim().toLowerCase() : ''
  const filtered = useMemo(
    () =>
      term === '' ? options : options.filter((option) => option.label.toLowerCase().includes(term)),
    [options, term]
  )
  /** 渲染用高亮下标：候选缩短时夹取，避免 activedescendant 指向不存在的项。 */
  const highlightedIndex = activeIndex >= 0 && activeIndex < filtered.length ? activeIndex : -1
  const closePanel = useCallback(() => {
    setOpen(false)
    setActiveIndex(-1)
    setPos(null)
    setTyping(false)
  }, [])
  const openPanel = useCallback(() => {
    if (disabled) return
    setOpen(true)
    setActiveIndex(
      Math.max(
        options.findIndex((option) => option.value === value),
        0
      )
    )
  }, [disabled, options, value])
  const commit = useCallback(
    (index: number) => {
      const option = filtered[index]
      if (!option) return
      onChange?.(option.value)
      setTyping(false)
      setOpen(false)
      setActiveIndex(-1)
      setPos(null)
    },
    [filtered, onChange]
  )
  // 点击组件外部关闭（面板在 body，需同时检查输入框与面板引用）。
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
  // 定位：以输入框矩形为锚（左对齐、同宽）；下方不足时上翻；滚动 / 缩放重算。
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
  useEffect(() => {
    if (!open || highlightedIndex < 0) return
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, highlightedIndex])
  const handleInput = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value
    setTyping(true)
    setQuery(next)
    setOpen(true)
    setActiveIndex(0)
    if (value !== undefined && value !== '' && next !== selectedLabel) onChange?.('')
  }
  const handleFocus = (): void => {
    if (disabled) return
    setTyping(false)
    setOpen(true)
    setActiveIndex(
      Math.max(
        options.findIndex((option) => option.value === value),
        0
      )
    )
    inputRef.current?.select()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        if (!open) {
          openPanel()
          return
        }
        const count = filtered.length
        if (count === 0) return
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex((current) => {
          if (current < 0) return direction === 1 ? 0 : count - 1
          return (current + direction + count) % count
        })
        break
      }
      case 'Enter':
        event.preventDefault()
        if (open) commit(highlightedIndex >= 0 ? highlightedIndex : 0)
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
      className={cx(
        'wf-select',
        'wf-combobox',
        size && size !== 'md' && `wf-select--${size}`,
        open && 'is-open',
        disabled && 'is-disabled'
      )}
    >
      <input
        ref={inputRef}
        className="wf-select__trigger wf-combobox__input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
        }
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
        disabled={disabled}
        placeholder={placeholder}
        value={typing ? query : selectedLabel}
        onChange={handleInput}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
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
              {filtered.length === 0 ? (
                <div className="wf-select__empty">{emptyText ?? t('noOptions')}</div>
              ) : (
                filtered.map((option, index) => {
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
                      className={cx(
                        'wf-select__option',
                        isSelected && 'is-selected',
                        index === highlightedIndex && 'is-active'
                      )}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commit(index)}
                    >
                      <span className="wf-select__option-label">{option.label}</span>
                      {isSelected && (
                        <span className="wf-select__check" aria-hidden="true">
                          ✓
                        </span>
                      )}
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
