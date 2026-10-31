import { forwardRef, useCallback, useRef, useState, type ReactNode } from 'react'
import type { ChangeEvent, ForwardedRef, InputHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import '../../styles/components/form-extras.css'

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 清除回调；受控模式下必须提供（否则清除按钮不渲染）。 */
  onClear?: () => void
  /** 是否显示清除按钮，默认 true。 */
  clearable?: boolean
  /** 前置图标，默认放大镜。 */
  icon?: ReactNode
}

function mergeRef(
  node: HTMLInputElement | null,
  inner: { current: HTMLInputElement | null },
  ref: ForwardedRef<HTMLInputElement>
): void {
  inner.current = node
  if (typeof ref === 'function') {
    ref(node)
  } else if (ref) {
    ref.current = node
  }
}

function DefaultSearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/**
 * 搜索输入框：前置图标 + 输入 + 可选清除按钮。
 * 透传原生 <input> 属性，支持受控 / 非受控与 ref 转发。
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    onClear,
    clearable = true,
    icon,
    className,
    value,
    defaultValue,
    onChange,
    disabled = false,
    ...rest
  },
  ref
) {
  const { t } = useTranslation('common')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isControlled = value !== undefined
  const [innerValue, setInnerValue] = useState(() => String(defaultValue ?? ''))
  const current = isControlled ? String(value ?? '') : innerValue

  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      mergeRef(node, inputRef, ref)
    },
    [ref]
  )

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!isControlled) setInnerValue(event.target.value)
    onChange?.(event)
  }

  const handleClear = () => {
    if (!isControlled) setInnerValue('')
    onClear?.()
    inputRef.current?.focus()
  }

  const canClear = clearable && (onClear !== undefined || !isControlled)
  const showClear = canClear && current.length > 0

  const classes = ['wf-search', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <span className="wf-search__icon" aria-hidden="true">
        {icon ?? <DefaultSearchIcon />}
      </span>
      <input
        {...rest}
        ref={setRef}
        className="wf-search__input"
        type="search"
        value={isControlled ? String(value ?? '') : innerValue}
        disabled={disabled}
        onChange={handleChange}
      />
      {showClear ? (
        <button
          type="button"
          className="wf-search__clear"
          aria-label={t('clear')}
          onClick={handleClear}
        >
          <ClearIcon />
        </button>
      ) : null}
    </div>
  )
})

SearchInput.displayName = 'SearchInput'

export default SearchInput
