import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'

/** 画布缩放上下限（滚轮 / 按钮 / 适应画布共用）。 */
export const ORG_CHART_MIN_SCALE = 0.3
export const ORG_CHART_MAX_SCALE = 2

/** 滚轮缩放灵敏度：`Math.exp(-deltaY * 0.0015)`。 */
const ZOOM_SENSITIVITY = 0.0015
/** 按钮缩放步进。 */
const ZOOM_STEP = 1.2
/** 拖拽判定阈值：位移小于 4px 视为点击，不产生平移。 */
const PAN_THRESHOLD = 4
/** 适应画布时内容四周留白。 */
const FIT_PADDING = 32

export interface OrgChartTransform {
  x: number
  y: number
  scale: number
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  originX: number
  originY: number
  active: boolean
}

/** 拖拽的起点元素：按钮 / 链接 / 表单 / 显式标记不触发画布平移。 */
const NO_PAN_SELECTOR = 'button, a, input, textarea, select, summary, [data-org-no-pan]'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 画布变换：拖拽平移 + 滚轮缩放 + 按钮缩放 + 适应画布。
 *
 * 坐标以视口左上角为原点，canvas 通过 `translate(x,y) scale(scale)` 变换。
 * 滚轮 / 按钮缩放都以锚点（鼠标位置 / 视口中心）为不动点，避免缩放时内容跳走。
 */
export function useOrgChartTransform(
  viewportRef: RefObject<HTMLDivElement | null>,
  canvasRef: RefObject<HTMLDivElement | null>
): {
  transform: OrgChartTransform
  canvasStyle: CSSProperties
  panning: boolean
  handlers: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void
  }
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  percent: number
} {
  const [transform, setTransform] = useState<OrgChartTransform>({ x: 0, y: 0, scale: 1 })
  const [panning, setPanning] = useState(false)
  const dragRef = useRef<DragState | null>(null)

  /** 以视口内某点为锚点缩放（保持该点下的内容不动）。 */
  const zoomAt = useCallback((anchorX: number, anchorY: number, factor: number): void => {
    setTransform((prev) => {
      const nextScale = clamp(prev.scale * factor, ORG_CHART_MIN_SCALE, ORG_CHART_MAX_SCALE)
      if (nextScale === prev.scale) return prev
      const ratio = nextScale / prev.scale
      return {
        x: anchorX - (anchorX - prev.x) * ratio,
        y: anchorY - (anchorY - prev.y) * ratio,
        scale: nextScale
      }
    })
  }, [])

  // 滚轮必须用原生非 passive 监听才能 preventDefault（React 的 wheel 为 passive）。
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const rect = viewport.getBoundingClientRect()
      const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY)
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [viewportRef, zoomAt])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest(NO_PAN_SELECTOR)) return
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: transform.x,
        originY: transform.y,
        active: false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [transform.x, transform.y]
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.active) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return
      drag.active = true
      setPanning(true)
    }
    setTransform((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }))
  }, [])

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drag.active) setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  const zoomIn = useCallback((): void => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, ZOOM_STEP)
  }, [viewportRef, zoomAt])

  const zoomOut = useCallback((): void => {
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    zoomAt(rect.width / 2, rect.height / 2, 1 / ZOOM_STEP)
  }, [viewportRef, zoomAt])

  /** 按全部节点实测包围盒居中缩放（不依赖 canvas 的撑开宽度）。 */
  const fit = useCallback((): void => {
    const viewport = viewportRef.current
    const canvas = canvasRef.current
    if (!viewport || !canvas) return
    const nodes = canvas.querySelectorAll<HTMLElement>('[data-org-node-id]')
    if (nodes.length === 0) {
      setTransform({ x: 0, y: 0, scale: 1 })
      return
    }

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    for (const node of nodes) {
      minX = Math.min(minX, node.offsetLeft)
      minY = Math.min(minY, node.offsetTop)
      maxX = Math.max(maxX, node.offsetLeft + node.offsetWidth)
      maxY = Math.max(maxY, node.offsetTop + node.offsetHeight)
    }
    if (maxX <= minX || maxY <= minY) return

    const rect = viewport.getBoundingClientRect()
    const width = maxX - minX
    const height = maxY - minY
    const scale = clamp(
      Math.min(1, (rect.width - FIT_PADDING * 2) / width, (rect.height - FIT_PADDING * 2) / height),
      ORG_CHART_MIN_SCALE,
      ORG_CHART_MAX_SCALE
    )
    setTransform({
      x: (rect.width - width * scale) / 2 - minX * scale,
      y: (rect.height - height * scale) / 2 - minY * scale,
      scale
    })
  }, [viewportRef, canvasRef])

  const canvasStyle: CSSProperties = {
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
  }

  return {
    transform,
    canvasStyle,
    panning,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endPan, onPointerCancel: endPan },
    zoomIn,
    zoomOut,
    fit,
    percent: Math.round(transform.scale * 100)
  }
}
