import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { OrgChartNode } from '../orgChart'

/** 一条连接父卡底部中心与子卡顶部中心的 elbow 折线。 */
export interface OrgChartLine {
  key: string
  d: string
}

interface NodeRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 收集当前可见的父子边：折叠节点的子树不渲染，也不产生连线。
 * 孤儿节点没有子节点，无需遍历其 children。
 */
function collectEdges(
  nodes: readonly OrgChartNode[],
  collapsed: ReadonlySet<number>,
  edges: Array<{ parentId: number; childId: number }>
): void {
  for (const node of nodes) {
    if (collapsed.has(node.id)) continue
    for (const child of node.children) {
      edges.push({ parentId: node.id, childId: child.id })
      collectEdges([child], collapsed, edges)
    }
  }
}

/** 生成 elbow：父卡底 → 上下中线下行 → 水平到子卡中心线 → 子卡顶。 */
function buildPath(parent: NodeRect, child: NodeRect): string {
  const startX = parent.left + parent.width / 2
  const startY = parent.top + parent.height
  const endX = child.left + child.width / 2
  const endY = child.top
  const midY = startY + (endY - startY) / 2
  return `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`
}

function sameLines(left: readonly OrgChartLine[], right: readonly OrgChartLine[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index].key !== right[index].key || left[index].d !== right[index].d) return false
  }
  return true
}

/**
 * 测量卡片在 canvas 未缩放坐标系中的位置，生成 SVG 折线。
 *
 * 节点位置用 `offsetLeft / offsetTop`（相对 `position: relative` 的 canvas），
 * 不受画布 transform 影响；折叠 / 展开、成员换行、字体加载引起的尺寸变化
 * 由 ResizeObserver（canvas + 每张卡）触发重测。缩放不需要重算：坐标本身不变。
 */
export function useOrgChartLines(
  canvasRef: RefObject<HTMLDivElement | null>,
  roots: readonly OrgChartNode[],
  orphans: readonly OrgChartNode[],
  collapsed: ReadonlySet<number>
): OrgChartLine[] {
  const [lines, setLines] = useState<OrgChartLine[]>([])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const edges: Array<{ parentId: number; childId: number }> = []
    collectEdges(roots, collapsed, edges)
    collectEdges(orphans, collapsed, edges)

    let frame = 0
    const measure = (): void => {
      const rects = new Map<number, NodeRect>()
      const nodes = canvas.querySelectorAll<HTMLElement>('[data-org-node-id]')
      for (const node of nodes) {
        const id = Number(node.dataset.orgNodeId)
        if (!Number.isFinite(id)) continue
        rects.set(id, {
          left: node.offsetLeft,
          top: node.offsetTop,
          width: node.offsetWidth,
          height: node.offsetHeight
        })
      }

      const next: OrgChartLine[] = []
      for (const edge of edges) {
        const parent = rects.get(edge.parentId)
        const child = rects.get(edge.childId)
        if (!parent || !child) continue
        next.push({
          key: `${edge.parentId}-${edge.childId}`,
          d: buildPath(parent, child)
        })
      }
      setLines((prev) => (sameLines(prev, next) ? prev : next))
    }

    measure()

    // 尺寸变化下一帧再测，合并折叠 / 换行产生的同一批回调。
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    })
    observer.observe(canvas)
    for (const node of canvas.querySelectorAll<HTMLElement>('[data-org-node-id]')) {
      observer.observe(node)
    }

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [canvasRef, roots, orphans, collapsed])

  return lines
}
