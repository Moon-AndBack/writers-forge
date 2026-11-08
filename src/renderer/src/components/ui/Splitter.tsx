import { useCallback } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  RefObject
} from 'react'
import { useTranslation } from 'react-i18next'
import { useSplitter, type SplitterAxis, type SplitterDir } from './useSplitter'

/** 分隔条方向：vertical = 左右分栏；horizontal = 上下分栏。 */
export type SplitterOrientation = 'vertical' | 'horizontal'

export interface SplitterProps {
  /** 分隔条方向（缺省 vertical）：决定拖拽轴、光标与变体类名。 */
  orientation?: SplitterOrientation
  /** 目标所在侧：vertical 用 left / right，horizontal 用 top / bottom。 */
  side: 'left' | 'right' | 'top' | 'bottom'
  /** 被测量 / 被拖拽的目标（vertical = 目标栏；horizontal = 上下两栏的容器）。 */
  targetRef: RefObject<HTMLElement | null>
  /** 受控值下限。 */
  min: number
  /** 受控值上限。 */
  max: number
  /** 当前值（受控值）。 */
  value: number
  /** 默认值（双击分隔条恢复到此值）。 */
  defaultValue: number
  /** 值变更回调。 */
  onChange: (value: number) => void
  /** 是否隐藏（尺寸归零 + pointer-events:none）。 */
  hidden?: boolean
  /**
   * 受控值单位：px（侧栏宽，缺省）/ percent（上下分栏占比，100 = 容器在该轴上的尺寸）。
   * percent 时按容器实测尺寸折算像素，只影响拖拽灵敏度与方向键步进。
   */
  unit?: 'px' | 'percent'
  /** 方向键每次调整的像素数（按 `unit` 折算）。 */
  keyboardStepPx?: number
}

/**
 * 分栏拖拽分隔条（8px，vertical → `cursor:col-resize`，horizontal → `row-resize`）。
 * 视觉与交互对齐 template/index.html 的 `.splitter`：hover / 拖拽 / 键盘聚焦时
 * 中央浮现品牌色圆条（`.splitter::before`），拖拽期间 body 挂 `is-resizing`
 * （上下分栏另挂 `is-resizing-y`）。
 *
 * 键盘可达：聚焦后按对应方向键调整（vertical 用左右键、horizontal 用上下键），
 * 每步默认 16px；双击恢复默认值。左右 / 上下分栏共用同一套拖拽逻辑
 * （`useSplitter`，按 `axis` 泛化），不存在第二份实现。
 */
export function Splitter({
  orientation = 'vertical',
  side,
  targetRef,
  min,
  max,
  value,
  defaultValue,
  onChange,
  hidden = false,
  unit = 'px',
  keyboardStepPx = 16
}: SplitterProps) {
  const { t } = useTranslation('common')
  const isVertical = orientation === 'vertical'
  const axis: SplitterAxis = isVertical ? 'x' : 'y'
  const dir: SplitterDir = side
  const percent = unit === 'percent'

  // percent 模式：100 个值单位 = 容器在拖拽轴上的实测尺寸。
  const resolveUnitPixels = useCallback((): number => {
    if (!percent) return 1
    const rect = targetRef.current?.getBoundingClientRect()
    const extent = rect ? (axis === 'y' ? rect.height : rect.width) : 0
    return extent > 0 ? extent / 100 : 1
  }, [percent, targetRef, axis])

  const { onPointerDown, onPointerMove, onPointerUp } = useSplitter({
    targetRef,
    axis,
    dir,
    min,
    max,
    value,
    onChange,
    pixelsPerUnit: percent ? resolveUnitPixels : undefined,
    disabled: hidden
  })

  // 双击分隔条恢复默认值；与拖拽（pointerdown/move/up）互不冲突。
  const onDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault()
    onChange(defaultValue)
  }

  // 方向键调整：按「指针移动方向」换算（左/上目标随正向位移变大，右/下相反）。
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (hidden) return
    const forwardKey = axis === 'y' ? 'ArrowDown' : 'ArrowRight'
    const backwardKey = axis === 'y' ? 'ArrowUp' : 'ArrowLeft'
    if (event.key !== forwardKey && event.key !== backwardKey) return
    event.preventDefault()
    const sign = side === 'left' || side === 'top' ? 1 : -1
    const units = (keyboardStepPx / resolveUnitPixels()) * (event.key === forwardKey ? 1 : -1)
    onChange(Math.max(min, Math.min(max, value + sign * units)))
  }

  const variant = isVertical ? side : 'horizontal'

  return (
    <div
      className={`splitter splitter-${variant}${hidden ? ' is-hidden' : ''}`}
      role="separator"
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={percent ? `${Math.round(value)}%` : undefined}
      aria-hidden={hidden || undefined}
      aria-disabled={hidden || undefined}
      tabIndex={hidden ? -1 : 0}
      title={percent ? t('restoreDefaultSplit') : t('restoreDefaultWidth')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    />
  )
}

export default Splitter
