import { useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent, MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import '../../styles/components/form-extras.css'

export interface ChipInputProps {
  /** 当前标签（受控）。 */
  value: string[]
  /** 标签变化回调。 */
  onChange: (value: string[]) => void
  /** 输入框占位文案。 */
  placeholder?: string
  /** 标签数量上限（达到后不再新增）。 */
  max?: number
  /** 禁用整个控件。 */
  disabled?: boolean
  /** 错误态：附加 is-invalid。 */
  invalid?: boolean
  /** 输入框 id，便于与 FormField 的 htmlFor 关联。 */
  id?: string
  /** 无可见标签时提供给无障碍。 */
  ariaLabel?: string
  className?: string
}

/**
 * 受控标签输入：回车 / 逗号新增，Backspace 删末项，每项可点 × 删除。
 */
export function ChipInput({
  value,
  onChange,
  placeholder,
  max,
  disabled = false,
  invalid = false,
  id,
  ariaLabel,
  className
}: ChipInputProps) {
  const { t } = useTranslation('common')
  const [draft, setDraft] = useState('')
  const entryRef = useRef<HTMLInputElement | null>(null)

  const atMax = max !== undefined && value.length >= max

  const commit = (raw: string) => {
    const text = raw.trim()
    if (!text) return
    if (atMax) return
    if (value.includes(text)) {
      setDraft('')
      return
    }
    onChange([...value, text])
    setDraft('')
  }

  const removeAt = (index: number) => {
    if (disabled) return
    onChange(value.filter((_, i) => i !== index))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text')
    if (!text || !/[\n,]/.test(text)) return
    event.preventDefault()
    const next = [...value]
    for (const piece of text.split(/[\n,]+/)) {
      const tag = piece.trim()
      if (!tag) continue
      if (max !== undefined && next.length >= max) break
      if (!next.includes(tag)) next.push(tag)
    }
    onChange(next)
    setDraft('')
  }

  const handleFieldClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    entryRef.current?.focus()
  }

  const classes = [
    'wf-chipinput',
    disabled ? 'is-disabled' : '',
    invalid ? 'is-invalid' : '',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <div className="wf-chipinput__field" onClick={handleFieldClick}>
        {value.map((tag, index) => (
          <span className="wf-chipinput__chip chip-pill chip-pill--neutral" key={`${tag}-${index}`}>
            {tag}
            <button
              type="button"
              className="wf-chipinput__chip-close"
              aria-label={t('removeTag', { tag })}
              disabled={disabled}
              onClick={() => removeAt(index)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={entryRef}
          id={id}
          className="wf-chipinput__entry"
          type="text"
          value={draft}
          placeholder={value.length === 0 ? (placeholder ?? t('chipPlaceholder')) : ''}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
      </div>
    </div>
  )
}

ChipInput.displayName = 'ChipInput'

export default ChipInput
