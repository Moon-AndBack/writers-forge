import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import '../../styles/components/display-extras.css'

export interface ColorSwatchOption {
  /** 选项值，用于与 value 比较。 */
  value: string
  /** 色块填充，任意 CSS 颜色或渐变。 */
  css: string
  /** 选中双环颜色；缺省时使用 css（渐变色请显式提供）。 */
  ring?: string
}

/** 允许直接传纯色字符串，或传完整选项对象。 */
export type ColorSwatchInput = string | ColorSwatchOption
export type ColorSwatchSize = 'sm' | 'md' | 'lg'

/** 默认色板：全部由主题令牌派生，随主题切换。 */
const DEFAULT_COLORS: ReadonlyArray<ColorSwatchOption> = [
  {
    value: 'brand',
    css: 'linear-gradient(135deg, var(--brand), var(--brand-2))',
    ring: 'var(--brand)'
  },
  { value: 'brand-2', css: 'var(--brand-2)' },
  { value: 'ok', css: 'var(--ok)' },
  { value: 'warn', css: 'var(--warn)' },
  { value: 'danger', css: 'var(--danger)' },
  { value: 'neutral', css: 'var(--text-mute)' }
]

export interface ColorSwatchPickerProps {
  /** 当前选中值（受控）。 */
  value?: string
  /** 选中变更回调。 */
  onChange?: (value: string) => void
  /** 色板选项；字符串视为纯色，缺省使用内置一组。 */
  colors?: ReadonlyArray<ColorSwatchInput>
  /** 色块尺寸，默认 md（26px）。 */
  size?: ColorSwatchSize
  /** 是否整体禁用。 */
  disabled?: boolean
  /** 合并到根节点的类名。 */
  className?: string
  /** 无障碍名称。 */
  'aria-label'?: string
}

function normalize(input: ColorSwatchInput): ColorSwatchOption {
  return typeof input === 'string' ? { value: input, css: input } : input
}

/**
 * 色板选择（本域额外控件）。
 * 原型：template/index.html 的 .cover-picker / .cover-swatch；选中项双环高亮，
 * hover 轻微放大，键盘方向键可切换（radiogroup 语义）。
 */
export function ColorSwatchPicker({
  value,
  onChange,
  colors,
  size = 'md',
  disabled = false,
  className,
  'aria-label': ariaLabel
}: ColorSwatchPickerProps) {
  const baseId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const options = (colors ?? DEFAULT_COLORS).map(normalize)
  const selectedIndex = options.findIndex((option) => option.value === value)
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0

  const classes = ['wf-swatch', size !== 'md' ? `wf-swatch--${size}` : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  const moveTo = (index: number) => {
    const target = options[index]
    if (!target) return
    refs.current[index]?.focus()
    onChange?.(target.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return
    const count = options.length
    if (count === 0) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      moveTo((index + 1) % count)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveTo((index - 1 + count) % count)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(count - 1)
    }
  }

  return (
    <div
      className={classes}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={`${baseId}-${index}`}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            tabIndex={index === tabbableIndex ? 0 : -1}
            className={active ? 'wf-swatch__item is-active' : 'wf-swatch__item'}
            style={{ background: option.css, color: option.ring ?? option.css }}
            onClick={() => onChange?.(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          />
        )
      })}
    </div>
  )
}

ColorSwatchPicker.displayName = 'ColorSwatchPicker'

export default ColorSwatchPicker
