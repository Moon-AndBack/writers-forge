import type { ReactNode } from 'react'
import '../../styles/components/segmented.css'

export interface SegmentedOption<T extends string = string> {
  /** 选项值（作为 key 与受控值）。 */
  value: T
  /** 选项显示内容。 */
  label: ReactNode
  /** 是否禁用该项。 */
  disabled?: boolean
}

export interface SegmentedProps<T extends string = string> {
  /** 选项列表。 */
  options: ReadonlyArray<SegmentedOption<T>>
  /** 当前选中值（受控）。 */
  value: T
  /** 选中变更回调。 */
  onChange?: (value: T) => void
  /** 尺寸，默认 md。 */
  size?: 'sm' | 'md'
  /** 合并到根节点的类名。 */
  className?: string
  /** 无障碍名称。 */
  'aria-label'?: string
}

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * 分段控件 / 标签切换（本域额外控件）。
 * 由一组互斥的 <button> 组成，样式与 template 的 shelf-tabs / mini-seg 对应。
 */
export function Segmented<T extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  'aria-label': ariaLabel
}: SegmentedProps<T>) {
  return (
    <div
      className={cn('wf-seg', size !== 'md' && `wf-seg--${size}`, className)}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            className={cn('wf-seg__item', active && 'is-active')}
            onClick={() => onChange?.(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default Segmented
