import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** `useChipOverflow` 的可调项（跨域复用：行数上限与「＋N」识别方式由调用方决定）。 */
export interface UseChipOverflowOptions {
  /** 最多容纳的行数（关系行传 1，剧情场景卡传 2）。 */
  maxRows: number
  /**
   * 「＋N」计数胶囊的识别方式：这些子元素不参与容量测量。
   * 传 CSS 选择器字符串（如 '.plot-char-more'），不传则所有直接子元素都算。
   */
  moreSelector?: string
}

/**
 * 按实际可用宽测量「胶囊容量」（前 `maxRows` 行内可容纳的胶囊数）。
 *
 * 统一按布局测量，不区分固定槽位上限：容器宽足够时容量更大，空间足够即不折叠。
 * 容器宽由各自布局决定（剧情场景卡：紧凑 `clamp(220px,100%,420px)` / 宽屏卡右侧
 * 剩余宽），测量口径一致。
 *
 * 测量依据 `listRef` 内除「＋N」计数胶囊（`moreSelector` 匹配项，省略则不过滤）
 * 之外的直接子元素（同一行按 `offsetTop` 归并，容 1px 误差）。容量只描述
 * 「胶囊能占多少」，「＋N」的槽位由调用方在容量内预留。
 * 布局签名（可用宽 `layoutKey` / 胶囊总数 / 行数上限）变化时先恢复全量渲染再测量——
 * 截断后被隐藏项已不在 DOM，无法据其测行。未测量时返回 `+∞`（视为全量可见）。
 */
export function useChipOverflow(
  listRef: RefObject<HTMLElement | null>,
  itemCount: number,
  layoutKey: number,
  options: UseChipOverflowOptions
): number {
  const { maxRows, moreSelector } = options
  const [rowLimit, setRowLimit] = useState(Number.POSITIVE_INFINITY)
  // 布局签名（可用宽 / 胶囊数 / 行数上限）：变化即需重新测量。
  const signatureRef = useRef('')
  const pendingRef = useRef(true)

  useLayoutEffect(() => {
    const signature = `${layoutKey}|${itemCount}|${maxRows}`
    if (signature !== signatureRef.current) {
      signatureRef.current = signature
      pendingRef.current = true
    }
    // 胶囊数 ≤ 行数上限时必不溢出（各占一行也在上限内）：复位为「全量可见」，
    // 避免沿用上一布局残留的旧容量把本不该折叠的胶囊误折叠成「＋N」。
    if (itemCount <= maxRows) {
      let resetCancelled = false
      void Promise.resolve().then(() => {
        if (!resetCancelled) setRowLimit(Number.POSITIVE_INFINITY)
      })
      return () => {
        resetCancelled = true
      }
    }
    if (!pendingRef.current) return undefined
    if (!listRef.current) return undefined
    let cancelled = false
    // 延迟到微任务再测量 / 读写 state：避免在 effect 内同步 setState
    // （react-hooks/set-state-in-effect），DOM 已提交、测量口径不变。
    void Promise.resolve().then(() => {
      if (cancelled || !pendingRef.current) return
      const el = listRef.current
      if (!el) return
      // 仅计实体胶囊：排除「＋N」计数胶囊（`moreSelector` 未传时不过滤）。
      const items = Array.from(el.children).filter(
        (child) => !(moreSelector && (child as HTMLElement).matches(moreSelector))
      ) as HTMLElement[]
      if (items.length < itemCount) {
        // 当前为截断渲染：先恢复全量，等下一轮渲染再测量。
        setRowLimit(Number.POSITIVE_INFINITY)
        return
      }
      pendingRef.current = false
      const next = countInRows(items, maxRows)
      setRowLimit((prev) => (prev === next ? prev : next))
    })
    return () => {
      cancelled = true
    }
  }, [listRef, layoutKey, itemCount, maxRows, moreSelector, rowLimit])

  return rowLimit
}

/** 统计前 `maxRows` 行内的元素数量（按 `offsetTop` 分行，容 1px 误差）。 */
function countInRows(items: HTMLElement[], maxRows: number): number {
  if (items.length === 0) return 0
  let rows = 1
  let count = 0
  let rowTop = items[0].offsetTop
  for (const item of items) {
    if (item.offsetTop > rowTop + 1) {
      rows += 1
      rowTop = item.offsetTop
      if (rows > maxRows) break
    }
    count += 1
  }
  return count
}
