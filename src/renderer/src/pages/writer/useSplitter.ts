import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** 拖拽轴：x = 左右分栏（宽）；y = 上下分栏（高）。 */
export type SplitterAxis = 'x' | 'y'

/** 目标相对分隔条的方位：left / right（x 轴）、top / bottom（y 轴）。 */
export type SplitterDir = 'left' | 'right' | 'top' | 'bottom'

/**
 * 分栏拖拽分隔条的通用逻辑（左右 / 上下共用一套）。
 *
 * 采用 Pointer Events + `setPointerCapture`：按下后由分隔条自身捕获指针，
 * 移动 / 抬起均在自身处理，无需挂 window 监听，组件卸载即自然解绑。
 * 拖拽期间在 `document.body` 上挂 `is-resizing`（全局 col-resize 光标 + 禁选），
 * 上下分栏另挂 `is-resizing-y`（全局 row-resize 光标）。
 *
 * `pointermove` 用 `requestAnimationFrame` 合并：同一帧内多次移动只保留
 * 最新坐标，帧内仅调用一次 `onChange`，避免每个 move 都触发 React setState
 * 重渲染造成拖拽迟滞。拖拽结束 / 组件卸载时取消挂起的 rAF。
 */
export interface SplitterOptions {
  /** 起始尺寸使用的目标元素（侧栏 `.sidepane` / `.rightpane`，或上下分栏的容器）。 */
  targetRef: React.RefObject<HTMLElement | null>
  /** 拖拽轴：缺省 `x`（左右分栏）。 */
  axis?: SplitterAxis
  /** 目标所在方位：left / top 随指针正向位移变大，right / bottom 相反。 */
  dir: SplitterDir
  /** 受控值下限。 */
  min: number
  /** 受控值上限。 */
  max: number
  /** 当前值（受控值）。 */
  value: number
  /** 值变更回调（已 clamp）。 */
  onChange: (value: number) => void
  /**
   * 受控值单位换算：每 1 个值单位对应的像素数。
   * - 缺省：值即像素，起始值取 `targetRef` 在拖拽轴上的实测尺寸（侧栏宽 / 高）；
   * - 提供数值 / 函数：起始值直接取 `value`（百分比等抽象单位），每次拖动按实时换算，
   *   供上下分栏用百分比控制高度（容器缩放时比例自然保持）。
   */
  pixelsPerUnit?: number | (() => number)
  /** 是否禁用（隐藏时）。 */
  disabled?: boolean
}

export interface SplitterHandle {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** 指针在拖拽轴上的坐标。 */
function pointerPos(event: ReactPointerEvent<HTMLDivElement>, axis: SplitterAxis): number {
  return axis === 'y' ? event.clientY : event.clientX
}

/**
 * 分隔条拖拽 hook：返回三个指针事件处理器。
 * 起始值优先取目标元素实测尺寸，后续按指针位移换算并 clamp 到 [min, max]。
 */
export function useSplitter({
  targetRef,
  axis = 'x',
  dir,
  min,
  max,
  value,
  onChange,
  pixelsPerUnit,
  disabled = false
}: SplitterOptions): SplitterHandle {
  const state = useRef({ start: 0, startValue: value })
  const draggingRef = useRef(false)
  // 待处理的指针坐标（仅保留同帧内最新值）与挂起的 rAF id。
  const pendingRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  // 每值单位对应的像素数（百分比模式按容器实测尺寸现算，容器缩放后仍准确）。
  const resolveUnitPixels = useCallback((): number => {
    const resolved = typeof pixelsPerUnit === 'function' ? pixelsPerUnit() : (pixelsPerUnit ?? 1)
    return resolved > 0 ? resolved : 1
  }, [pixelsPerUnit])

  // 卸载时取消挂起的 rAF，避免对已卸载组件触发 setState。
  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    },
    []
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (disabled || event.button !== 0) return
      event.preventDefault()
      const target = targetRef.current
      const rect = target?.getBoundingClientRect()
      const measured = rect ? (axis === 'y' ? rect.height : rect.width) : value
      // 百分比等抽象单位直接以受控值为起始（不读像素尺寸）。
      const startValue = pixelsPerUnit === undefined ? measured : value

      state.current = { start: pointerPos(event, axis), startValue }
      draggingRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('is-dragging')
      document.body.classList.add('is-resizing')
      if (axis === 'y') document.body.classList.add('is-resizing-y')
    },
    [disabled, targetRef, value, axis, pixelsPerUnit]
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      // 只记录最新坐标；同一帧内的多次移动由一次 rAF 回调统一处理。
      pendingRef.current = pointerPos(event, axis)
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const delta = pendingRef.current - state.current.start
        const sign = dir === 'left' || dir === 'top' ? 1 : -1
        onChange(clamp(state.current.startValue + (sign * delta) / resolveUnitPixels(), min, max))
      })
    },
    [axis, dir, max, min, onChange, resolveUnitPixels]
  )

  const end = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      // 取消挂起的 rAF：用抬起坐标补齐最后一帧，保证松手后尺寸与指针一致。
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      const delta = pointerPos(event, axis) - state.current.start
      const sign = dir === 'left' || dir === 'top' ? 1 : -1
      onChange(clamp(state.current.startValue + (sign * delta) / resolveUnitPixels(), min, max))
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      event.currentTarget.classList.remove('is-dragging')
      document.body.classList.remove('is-resizing')
      document.body.classList.remove('is-resizing-y')
    },
    [axis, dir, max, min, onChange, resolveUnitPixels]
  )

  return { onPointerDown, onPointerMove, onPointerUp: end }
}
