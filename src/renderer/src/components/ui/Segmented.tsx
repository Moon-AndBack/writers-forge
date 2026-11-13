import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@renderer/lib/cn'
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

/** 滑动指示器相对容器的实测矩形（offset*，单位 px）。 */
interface ThumbRect {
  x: number
  y: number
  w: number
  h: number
  /** 首帧测量完成后才启用过渡，避免从 (0,0) 滑入。 */
  ready: boolean
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
  const rootRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<ThumbRect>({ x: 0, y: 0, w: 0, h: 0, ready: false })

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    let cancelled = false
    let frame = 0

    // 用 offset* 实测 active 项相对容器（.wf-seg 为 offsetParent）的位置与尺寸，
    // 不按百分比推断——各调用点的项宽并不相等。
    const measure = (): void => {
      const active = root.querySelector<HTMLButtonElement>('.wf-seg__item.is-active')
      setThumb((prev) => {
        const next = {
          x: active?.offsetLeft ?? 0,
          y: active?.offsetTop ?? 0,
          w: active?.offsetWidth ?? 0,
          h: active?.offsetHeight ?? 0,
          ready: prev.ready
        }
        if (prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h) {
          return prev
        }
        return next
      })
    }

    measure()

    // 容器宽度变化（右栏拖拽 / 窗口缩放）与 active 项自身宽度变化（文案 / 字号）
    // 都要重测。
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    const active = root.querySelector<HTMLButtonElement>('.wf-seg__item.is-active')
    if (active) observer.observe(active)

    // 下一帧再启用过渡：首帧测量结果直接落位，不做位移动画。
    frame = requestAnimationFrame(() => {
      setThumb((prev) => (prev.ready ? prev : { ...prev, ready: true }))
    })

    // 字体加载会改变中英文标签宽度，就绪后补测一次。
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [value, options, size])

  const thumbStyle = {
    '--wf-seg-x': `${thumb.x}px`,
    '--wf-seg-y': `${thumb.y}px`,
    '--wf-seg-w': `${thumb.w}px`,
    '--wf-seg-h': `${thumb.h}px`
  } as CSSProperties

  return (
    <div
      ref={rootRef}
      className={cn('wf-seg', size !== 'md' && `wf-seg--${size}`, className)}
      role="group"
      aria-label={ariaLabel}
      data-thumb-ready={thumb.ready ? 'true' : 'false'}
    >
      <span
        aria-hidden="true"
        className="wf-seg__thumb"
        style={thumbStyle}
        data-empty={thumb.w === 0 ? 'true' : undefined}
      />
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
