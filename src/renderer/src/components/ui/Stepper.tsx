import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import '../../styles/components/form-extras.css'

export interface StepperProps {
  /** 当前值（受控）。 */
  value: number
  /** 值变化回调，回传已夹取到 min/max 的数值。 */
  onChange: (value: number) => void
  /** 下界（含）。 */
  min?: number
  /** 上界（含）。 */
  max?: number
  /** 步长，默认 1。 */
  step?: number
  /** 小数精度；缺省时按 step 推断，避免浮点误差。 */
  precision?: number
  /** 禁用整个控件。 */
  disabled?: boolean
  /** 值是否可点击编辑，默认 false。 */
  editable?: boolean
  /** 显示格式化函数，默认 String(value)。 */
  format?: (value: number) => string
  /** 无可见标签时提供给无障碍。 */
  ariaLabel?: string
  /** 增加 / 减少按钮的无障碍标签前缀，缺省用 common.stepperLabel。 */
  label?: string
  className?: string
}

function countDecimals(input: number): number {
  if (!Number.isFinite(input)) return 0
  const text = String(input)
  const dot = text.indexOf('.')
  return dot >= 0 ? text.length - dot - 1 : 0
}

function roundTo(input: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round((input + Number.EPSILON) * factor) / factor
}

/**
 * 步进器：− / 值 / + 结构，支持 min / max / step / disabled，值可选可编辑。
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  disabled = false,
  editable = false,
  format,
  ariaLabel,
  label,
  className
}: StepperProps) {
  const { t } = useTranslation('common')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const labelText = label ?? t('stepperLabel')

  const decimals = precision ?? countDecimals(step)

  const clamp = (input: number): number => {
    let next = input
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    return roundTo(next, decimals)
  }

  const commitValue = (input: number) => {
    if (Number.isNaN(input)) return
    const next = clamp(input)
    if (next !== value) onChange(next)
  }

  const nudge = (direction: 1 | -1) => {
    if (disabled) return
    commitValue(value + direction * step)
  }

  const startEditing = () => {
    if (disabled || !editable) return
    setDraft(String(value))
    setEditing(true)
  }

  const finishEditing = () => {
    if (!editing) return
    const parsed = Number(draft)
    setEditing(false)
    commitValue(parsed)
  }

  const cancelEditing = () => {
    setEditing(false)
    setDraft('')
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finishEditing()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
    }
  }

  const atMin = min !== undefined && value <= min
  const atMax = max !== undefined && value >= max
  const display = format ? format(value) : String(value)

  const classes = ['wf-stepper', disabled ? 'is-disabled' : '', className].filter(Boolean).join(' ')

  return (
    <div className={classes} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        className="wf-stepper__btn"
        aria-label={t('stepperDecrease', { label: labelText })}
        disabled={disabled || atMin}
        onClick={() => nudge(-1)}
      >
        −
      </button>

      {editing ? (
        <input
          className="wf-stepper__input"
          type="text"
          inputMode="decimal"
          value={draft}
          aria-label={ariaLabel ?? labelText}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={finishEditing}
          onKeyDown={handleInputKeyDown}
        />
      ) : editable ? (
        <button
          type="button"
          className="wf-stepper__value is-editable"
          disabled={disabled}
          aria-label={t('stepperEdit', { label: labelText })}
          onClick={startEditing}
        >
          {display}
        </button>
      ) : (
        <span className="wf-stepper__value">{display}</span>
      )}

      <button
        type="button"
        className="wf-stepper__btn"
        aria-label={t('stepperIncrease', { label: labelText })}
        disabled={disabled || atMax}
        onClick={() => nudge(1)}
      >
        +
      </button>
    </div>
  )
}

Stepper.displayName = 'Stepper'

export default Stepper
