import { useEffect, type RefObject } from 'react'

/** 与 bookshelf.css 的窄屏断点一致 */
const NARROW_BREAKPOINT = 640
/** 与 bookshelf.css 的网格定宽一致（宽屏 / 窄屏） */
const CARD_WIDTH_WIDE = 200
const CARD_WIDTH_NARROW = 160
/** 列间距兜底值（与 bookshelf.css `gap: 14px 18px` 的列间距一致） */
const COLUMN_GAP_FALLBACK = 18
/** 尺寸静默期（ms）：拖拽中布局连续变化，等停稳再上报，避免频繁重置主进程锁定档 */
const SETTLE_MS = 150

interface SnapBounds {
  /** `.book-grid` 内容盒宽（clientWidth − 左右 padding） */
  contentWidth: number
  /** 第一列实测宽度，解析失败按断点兜底 */
  cardWidth: number
  /** 实测列间距，解析失败取 18 */
  columnGap: number
}

/** 从网格计算出的吸附上报参数 */
interface SnapReport {
  cardWidth: number
  columnGap: number
  overhead: number
  maxColumns: number
}

function readSnapBounds(grid: HTMLElement): SnapBounds {
  const style = getComputedStyle(grid)
  const paddingLeft = parseFloat(style.paddingLeft) || 0
  const paddingRight = parseFloat(style.paddingRight) || 0
  // clientWidth 含 padding、不含边框与滚动条；减去左右 padding 即内容盒宽
  const contentWidth = grid.clientWidth - paddingLeft - paddingRight

  const narrow = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`).matches
  const fallbackCard = narrow ? CARD_WIDTH_NARROW : CARD_WIDTH_WIDE

  // gridTemplateColumns 实测形如 "200px 200px"；空网格可能为 "none" → NaN
  const firstTrack = style.gridTemplateColumns.split(/\s+/)[0] ?? ''
  const measuredCard = parseFloat(firstTrack)
  const cardWidth =
    Number.isFinite(measuredCard) && measuredCard > 0 ? Math.round(measuredCard) : fallbackCard

  const measuredGap = parseFloat(style.columnGap)
  const columnGap =
    Number.isFinite(measuredGap) && measuredGap >= 0 ? Math.round(measuredGap) : COLUMN_GAP_FALLBACK

  return { contentWidth, cardWidth, columnGap }
}

/**
 * 书籍页宽度磁吸：把 `.book-grid` 的实测尺寸上报给主进程，使其在拖拽缩放窗口宽度时
 * 吸附到「恰好容纳整数张卡片、左右无余量」的宽度。
 *
 * - 非 Electron（无 `window.api.windowSnap`）静默跳过；
 * - 依赖 `ResizeObserver`（网格尺寸）、`matchMedia`（640px 断点）与 `cardCount`（档位上限）
 *   变化重新上报；
 * - 卸载（离开书籍页）时 `clear()`，保证吸附仅书籍页生效；
 * - 上报参数不变时跳过，避免无谓的 IPC 与主进程锁定档重置。
 */
export function useShelfSnap(gridRef: RefObject<HTMLElement | null>, cardCount: number): void {
  useEffect(() => {
    const api = window.api?.windowSnap
    if (!api) return

    // 卡片数为 0 时没有合法档位（maxColumns ≥ 1），直接关闭
    if (cardCount < 1) {
      void api.clear().catch(() => {
        /* IPC 失败静默忽略 */
      })
      return
    }

    const grid = gridRef.current
    if (!grid) return

    let active = true
    let raf = 0
    let settle = 0
    let lastKey = ''

    const report = (): void => {
      if (!active) return
      const { contentWidth, cardWidth, columnGap } = readSnapBounds(grid)
      if (contentWidth <= 0) return

      void api
        .boundsWidth()
        .then((boundsWidth) => {
          if (!active) return
          // overhead 一次性涵盖窗口边框 + 网格 padding + 滚动条
          const overhead = Math.round(boundsWidth - contentWidth)
          if (overhead < 0) return

          const key = `${cardWidth}|${columnGap}|${overhead}|${cardCount}`
          if (key === lastKey) return
          lastKey = key

          const payload: SnapReport = { cardWidth, columnGap, overhead, maxColumns: cardCount }
          void api.set(payload).catch(() => {
            /* IPC 失败静默忽略：不影响渲染层 */
          })
        })
        .catch(() => {
          /* IPC 失败静默忽略 */
        })
    }

    // 布局静默后再测算，避免拖拽中的瞬时中间态污染 overhead
    const schedule = (): void => {
      window.clearTimeout(settle)
      settle = window.setTimeout(() => {
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(report)
      }, SETTLE_MS)
    }

    // 首帧立即上报，保证挂载后吸附即时生效（无需等待静默期）
    raf = requestAnimationFrame(report)

    const observer = new ResizeObserver(schedule)
    observer.observe(grid)

    const media = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`)
    media.addEventListener('change', schedule)

    return () => {
      active = false
      cancelAnimationFrame(raf)
      window.clearTimeout(settle)
      observer.disconnect()
      media.removeEventListener('change', schedule)
      void api.clear().catch(() => {
        /* IPC 失败静默忽略 */
      })
    }
  }, [gridRef, cardCount])
}
