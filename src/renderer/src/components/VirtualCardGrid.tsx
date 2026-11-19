/**
 * 通用「卡片网格 + 行级虚拟滚动」（AGENTS §9：多处网格共用一套实现）。
 *
 * 只渲染视口内的整行卡片，其余行由外层高度占位；列宽 / 间距 / 对齐沿用调用方的网格
 * CSS（`.wf-card-grid` / `.book-grid`），不在组件里另立尺寸口径：
 * - 列轨道实测：根节点保留原网格类名，内部另放零高量尺读自然列数；`.wf-card-grid`
 *   再按 `min(自然列数, 条目数, --wf-card-grid-max-columns)` 收敛成显式列。
 * - 按行虚拟：行高由该行最高卡片决定，虚拟项即一行；卡片仍是行容器的直接子元素，
 *   调用方的直接子选择器与容量实测都不变。
 * - 滚动容器自动识别：根节点自身可滚动（书架）就用自身，否则向上找最近的纵向滚动
 *   祖先，并用 `scrollMargin` 对齐列表起点，不改调用方的外层滚动结构。
 * - 滚动即收浮卡：跨过 `onScroll` 通知调用方关闭依赖卡片 DOM 的悬停卡。
 * - 换列补间：列数变化时按卡片 key 对齐前后矩形做 FLIP（见 cardGridFlip.ts）。
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  HTMLAttributes,
  ReactElement,
  ReactNode,
  RefObject
} from 'react'
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual'
import type { Range } from '@tanstack/react-virtual'
import { useColumnFlip } from './cardGridMetrics'

export interface VirtualCardGridProps<T> {
  items: readonly T[]
  getKey: (item: T) => string | number
  renderCard: (item: T) => ReactNode
  /** 无 CSS 轨道可读时的兜底最小卡宽（默认 240）。 */
  minCardWidth?: number
  /** 无 CSS 间距可读时的兜底间距（默认 12，与 `.wf-card-grid` 一致）。 */
  gap?: number
  /** 单行卡片高度的初始估算（默认 160；书架卡约 400）。 */
  estimateHeight?: number
  /** 原网格类名：会同时落到根节点与每一行容器上。 */
  className?: string
  /** 原网格 ref（调用方 `useStableMeasure` / 宽度测量用）。 */
  gridRef?: RefObject<HTMLDivElement | null> | ((node: HTMLDivElement | null) => void)
  /** 透传到根节点的其余属性（`aria-label` / `onMouseOver` 等）。 */
  gridProps?: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'>
  /** 滚动时回调（用于关闭依赖卡片 DOM 的悬停卡）。 */
  onScroll?: () => void
}

/** 根网格的实测布局：列宽、间距、内衬与对齐方式。 */
interface GridMetrics {
  /** 每列实际像素宽（长度即生效列数；已按条目数 / 列数上限收敛）。 */
  tracks: number[]
  rowGap: number
  columnGap: number
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
  /** 自身为滚动容器时的可视内容高（仅在 `centerVertically` 时有意义）。 */
  viewportHeight: number
  /** 原网格 `align-content` 是否居中（书架内容不足一屏时垂直居中）。 */
  centerVertically: boolean
}

/** 量尺最多跨多少列：显式轨道数远小于此，超出部分只是零宽隐式轨道。 */
const MAX_RULER_SPAN = 64

/** 卡片数达到该值时撑满整行；不足则按基准卡宽排列，右侧留白。 */
const FILL_MIN_COUNT = 3

/** 解析 px 值（`normal` 等非数值回退 0）。 */
function px(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** 把 `grid-template-columns` 的解析值拆成非零轨道宽。 */
function readTracks(value: string): number[] {
  return value
    .split(' ')
    .map((part) => Number.parseFloat(part))
    .filter((width) => Number.isFinite(width) && width > 0)
}

/** 轨道条数（容量探针只关心列数，1fr 等宽度在跨满时会被隐式轨道摊薄）。 */
function countTracks(value: string): number {
  return readTracks(value).length
}

/** 布局相等判定：避免 ResizeObserver 每帧写回同值（拖拽分隔条时尤其重要）。 */
function sameMetrics(a: GridMetrics, b: GridMetrics): boolean {
  if (a.tracks.length !== b.tracks.length) return false
  for (let index = 0; index < a.tracks.length; index += 1) {
    if (Math.abs(a.tracks[index] - b.tracks[index]) > 0.01) return false
  }
  return (
    a.rowGap === b.rowGap &&
    a.columnGap === b.columnGap &&
    a.paddingTop === b.paddingTop &&
    a.paddingRight === b.paddingRight &&
    a.paddingBottom === b.paddingBottom &&
    a.paddingLeft === b.paddingLeft &&
    a.viewportHeight === b.viewportHeight &&
    a.centerVertically === b.centerVertically
  )
}

/** 向上找最近的纵向滚动祖先；根节点自身可滚动时返回自身（书架）。 */
function findScrollElement(el: HTMLElement): HTMLElement {
  let node: HTMLElement | null = el
  while (node !== null) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node
    node = node.parentElement
  }
  return el
}

/**
 * 读取列 / 间距 / 内衬；无 CSS 轨道时按最小卡宽兜底。列宽从零高量尺读（同一份类名、
 * 同一内容宽）而不是根节点：根节点的子行是绝对定位，不适合承担 `auto-fit` 空轨道
 * 折叠的判定；量尺内只有一个按条目数跨列的常规网格项，结果与自然网格一致。
 */
function readMetrics(
  el: HTMLElement,
  ruler: HTMLElement | null,
  scrollEl: HTMLElement | null,
  itemCount: number,
  minCardWidth: number,
  fallbackGap: number
): GridMetrics {
  // 两段式量尺：先跨满（读到容器能容纳的列数 capacity），再按 min(条目数, capacity)
  // 跨列。第二段不会产生隐式轨道 / 额外列间距，`auto-fit` 的折叠结果才与自然网格一致。
  const rulerChild = ruler?.firstElementChild as HTMLElement | null
  if (ruler !== null && rulerChild !== null) {
    rulerChild.style.gridColumn = `1 / span ${MAX_RULER_SPAN}`
    const capacity = countTracks(window.getComputedStyle(ruler).gridTemplateColumns)
    const span = Math.min(Math.max(itemCount, 1), Math.max(capacity, 1))
    rulerChild.style.gridColumn = `1 / span ${span}`
  }
  const style = window.getComputedStyle(el)
  const trackStyle = window.getComputedStyle(ruler ?? el)
  const paddingTop = px(style.paddingTop)
  const paddingRight = px(style.paddingRight)
  const paddingBottom = px(style.paddingBottom)
  const paddingLeft = px(style.paddingLeft)
  const rowGap = px(trackStyle.rowGap)
  const columnGap = px(trackStyle.columnGap)
  let tracks = readTracks(trackStyle.gridTemplateColumns)
  if (tracks.length === 0) {
    // 没有网格类（或轨道尚未解析）时按最小卡宽均分，保证组件独立可用。
    const contentWidth = Math.max(0, el.clientWidth - paddingLeft - paddingRight)
    const gapValue = columnGap > 0 ? columnGap : fallbackGap
    const min = Math.max(1, minCardWidth)
    const count = Math.max(1, Math.floor((contentWidth + gapValue) / (min + gapValue)))
    const width = Math.max(0, (contentWidth - gapValue * (count - 1)) / count)
    for (let index = 0; index < count; index += 1) tracks.push(width)
  }
  // 列数收敛：CSS 变量是「按数量撑满」网格的开关（书架 `.book-grid` 不声明，继续走
  // `auto-fit` 固定卡宽）。列数取 min(自然列数, 条目数, 上限)：条目数 ≥3 时按该列数
  // 等分整行；不足 3 张时卡宽封顶在基准宽，右侧留白而不是被拉宽。
  const maxColumns = Number.parseInt(trackStyle.getPropertyValue('--wf-card-grid-max-columns'), 10)
  if (tracks.length > 0 && Number.isFinite(maxColumns) && maxColumns > 0) {
    const columns = Math.min(tracks.length, itemCount, maxColumns)
    const contentWidth = Math.max(0, el.clientWidth - paddingLeft - paddingRight)
    const available = contentWidth - columnGap * Math.max(columns - 1, 0)
    const fillWidth = columns > 0 ? available / columns : 0
    const sparseMax = px(trackStyle.getPropertyValue('--wf-card-grid-sparse-max'))
    const width =
      itemCount < FILL_MIN_COUNT && sparseMax > 0 ? Math.min(fillWidth, sparseMax) : fillWidth
    tracks = columns > 0 ? Array.from({ length: columns }, () => Math.max(0, width)) : []
  }
  const centerVertically = style.alignContent.includes('center')
  return {
    tracks,
    rowGap: rowGap > 0 ? rowGap : fallbackGap,
    columnGap: columnGap > 0 ? columnGap : fallbackGap,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    viewportHeight: centerVertically && el === scrollEl ? el.clientHeight : 0,
    centerVertically
  }
}

export function VirtualCardGrid<T>({
  items,
  getKey,
  renderCard,
  minCardWidth = 240,
  gap = 12,
  estimateHeight = 160,
  className,
  gridRef,
  gridProps,
  onScroll
}: VirtualCardGridProps<T>): ReactElement {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const rulerRef = useRef<HTMLDivElement | null>(null)
  const [metrics, setMetrics] = useState<GridMetrics | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  // 焦点所在行：行滚出可视范围时仍保留挂载，避免键盘焦点随卸载掉回 body。
  const [focusPin, setFocusPin] = useState<{ index: number; key: string } | null>(null)
  const lastWidthRef = useRef(0)
  // 已播放过进场动画的卡片 key：行滚出视口时登记，滚回视口时跳过重播。
  // 卡片数量受单库数据量约束，集合随组件实例存续，不做清理 / 上限。
  const [playedKeys, setPlayedKeys] = useState<ReadonlySet<string | number>>(() => new Set())
  // 上一次提交仍在虚拟行里的卡片 key：用于判定本帧哪些卡片滚出了视口。
  const mountedKeysRef = useRef<ReadonlySet<string | number>>(new Set())
  // 已提交的 items / getKey / 列数：给 FLIP 快照取 key，并保证只有列数变化才快照。
  const latestRef = useRef({ items, getKey, trackCount: 0 })
  const { capture, play } = useColumnFlip<T>()

  const handleFocus = useCallback((event: ReactFocusEvent<HTMLDivElement>): void => {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]')
    if (row === null || !event.currentTarget.contains(row)) return
    const index = Number(row.dataset.index)
    const key = row.dataset.rowKey
    if (!Number.isInteger(index) || key === undefined) return
    setFocusPin((prev) => (prev?.index === index && prev.key === key ? prev : { index, key }))
  }, [])

  const handleBlur = useCallback((event: ReactFocusEvent<HTMLDivElement>): void => {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setFocusPin(null)
  }, [])

  /** 内部 ref 与调用方 ref 合并（调用方仍拿到同一个根节点做宽度测量）。 */
  const setRoot = useCallback(
    (node: HTMLDivElement | null): void => {
      rootRef.current = node
      if (typeof gridRef === 'function') gridRef(node)
      else if (gridRef) gridRef.current = node
    },
    [gridRef]
  )

  // 滚动容器：优先自身，其次最近的纵向滚动祖先（不改外层结构）。
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el === null) return
    setScrollEl(findScrollElement(el))
  }, [])

  // 列轨道实测：类名 / 条目数变化都会改变有效列（auto-fit 折叠 / 展开）。
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el === null) return
    // `captureFlip` 仅由 ResizeObserver 传入：条目 / 类名变化时旧矩形已不可得。
    const read = (captureFlip: boolean): void => {
      const width = el.clientWidth
      if (width > 0 && lastWidthRef.current === 0) {
        // 从 display:none 恢复（右栏列表切详情）：浏览器恢复 scrollTop 时不一定派发
        // scroll 事件，主动通知虚拟器按当前偏移重新计算可视范围。
        const target = scrollEl ?? el
        target.dispatchEvent(new Event('scroll'))
      }
      lastWidthRef.current = width
      if (width === 0) return
      const next = readMetrics(el, rulerRef.current, scrollEl, items.length, minCardWidth, gap)
      const latest = latestRef.current
      if (captureFlip && latest.trackCount > 0 && next.tracks.length !== latest.trackCount) {
        capture(el, latest.items, latest.getKey, latest.trackCount)
      }
      setMetrics((prev) => (prev !== null && sameMetrics(prev, next) ? prev : next))
    }
    read(false)
    const observer = new ResizeObserver(() => read(true))
    observer.observe(el)
    return () => observer.disconnect()
  }, [className, items.length, scrollEl, minCardWidth, gap, capture])

  // 列表起点相对滚动内容原点的偏移（网格上方还有内衬 / 其它内容时）。
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el === null || scrollEl === null) return
    if (scrollEl === el) {
      setScrollMargin(0)
      return
    }
    const measure = (): void => {
      // 隐藏态（display:none）矩形全为 0：保留上一次有效值，等可见后再测。
      if (el.clientWidth === 0 || scrollEl.clientWidth === 0) return
      const next = Math.round(
        el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
      )
      setScrollMargin((prev) => (prev === next ? prev : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scrollEl)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollEl, metrics])

  // 滚动时通知调用方收掉依赖卡片 DOM 的悬停卡。
  useEffect(() => {
    if (!onScroll) return
    const target = scrollEl ?? rootRef.current
    if (target === null) return
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => target.removeEventListener('scroll', onScroll)
  }, [onScroll, scrollEl])

  const trackCount = metrics?.tracks.length ?? 0
  const rowCount = trackCount === 0 ? 0 : Math.ceil(items.length / trackCount)
  const estimateSize = useCallback(() => estimateHeight, [estimateHeight])
  // 保留亚像素行高（默认实现取整会在长列表上累积误差）。
  const measureRow = useCallback(
    (element: HTMLDivElement): number => element.getBoundingClientRect().height,
    []
  )
  const getItemKey = useCallback(
    (index: number): string | number => {
      const first = items[index * trackCount]
      return `${first === undefined ? '' : getKey(first)}#${trackCount}`
    },
    [items, getKey, trackCount]
  )
  // 仅当焦点行仍对应同一个「首条 key」时固定它（过滤后行内容变了就不再固定）。
  const pinnedIndex =
    focusPin !== null &&
    focusPin.index < rowCount &&
    String(getItemKey(focusPin.index)) === focusPin.key
      ? focusPin.index
      : null
  const rangeExtractor = useCallback(
    (range: Range): number[] => {
      const indexes = defaultRangeExtractor(range)
      if (pinnedIndex !== null && !indexes.includes(pinnedIndex)) {
        indexes.push(pinnedIndex)
        indexes.sort((a, b) => a - b)
      }
      return indexes
    },
    [pinnedIndex]
  )
  // TanStack Virtual 返回的实例方法不是可安全 memo 的纯值（React Compiler 会跳过本组件），
  // 这里只需要它渲染可见行，跳过编译不影响语义。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
    count: rowCount,
    getScrollElement: () => scrollEl ?? rootRef.current,
    estimateSize,
    measureElement: measureRow,
    getItemKey,
    rangeExtractor,
    gap: metrics?.rowGap ?? 0,
    overscan: 2,
    scrollMargin
  })

  // 挂载 / 切换滚动容器时容器可能已有偏移（例如从别的模块切回）：主动触发一次，
  // 让虚拟器读取当前 scrollTop，而不是从 0 开始只渲染首行。
  useLayoutEffect(() => {
    if (scrollEl === null) return
    scrollEl.dispatchEvent(new Event('scroll'))
  }, [scrollEl])

  const tracks = metrics?.tracks ?? []
  const contentHeight = virtualizer.getTotalSize()
  const paddingTop = metrics?.paddingTop ?? 0
  const paddingBottom = metrics?.paddingBottom ?? 0
  const viewportInner = metrics ? metrics.viewportHeight - paddingTop - paddingBottom : 0
  const centerOffset =
    metrics && metrics.centerVertically && contentHeight < viewportInner
      ? (viewportInner - contentHeight) / 2
      : 0
  // 多行时最后一行仍用完整轨道集，与首行严格对位；单行时按行内条目数裁轨道
  // （`.wf-card-grid` 的轨道已在 readMetrics 里按条目数收敛，这里兼容 `auto-fit` 书架）。
  const multiRow = rowCount > 1
  // 量尺跨列：条目数不足时复现 auto-fit 折叠后的实际列宽。
  const rulerSpan = Math.min(Math.max(items.length, 1), MAX_RULER_SPAN)
  const virtualRows = virtualizer.getVirtualItems()

  // 进场记账：本帧仍渲染在虚拟行里的 key 视为「挂载中」；上一次存在、这一次消失的
  // key 已播放过进场，记下来供滚回视口时抑制重播。只登记「离开」的 key，挂载期间
  // 行属性不变，避免动画进行到一半被撤销。依赖里的数组 / 回调每次渲染都是新值，
  // 实际等价于每次提交比对一遍可见行（可见行数量有限，开销可忽略）。
  useLayoutEffect(() => {
    const current = new Set<string | number>()
    for (const row of virtualRows) {
      const startIndex = row.index * trackCount
      for (const item of items.slice(startIndex, startIndex + trackCount)) {
        current.add(getKey(item))
      }
    }
    const departed: (string | number)[] = []
    for (const key of mountedKeysRef.current) {
      if (!current.has(key)) departed.push(key)
    }
    mountedKeysRef.current = current
    if (departed.length === 0) return
    setPlayedKeys((prev) => {
      if (departed.every((key) => prev.has(key))) return prev
      const next = new Set(prev)
      for (const key of departed) next.add(key)
      return next
    })
  }, [virtualRows, trackCount, items, getKey])

  // 换列补间：行容器已按新轨道重建，把仍在 DOM 的卡片从旧矩形补间到新矩形。行高刚被
  // ref 回调重测，`getVirtualItems()` 拿到的是校正后的行 top（渲染时还是估算值）。
  useLayoutEffect(() => {
    latestRef.current = { items, getKey, trackCount }
    const root = rootRef.current
    if (root === null) return
    play({
      root,
      items,
      getKey,
      trackCount,
      rows: virtualizer.getVirtualItems(),
      totalSize: virtualizer.getTotalSize(),
      paddingTop,
      scrollMargin,
      viewportInner,
      centerVertically: metrics?.centerVertically ?? false
    })
  })

  return (
    <div
      {...gridProps}
      ref={setRoot}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      style={{
        position: 'relative',
        height: paddingTop + contentHeight + paddingBottom,
        // 与行内像素轨道同步：外部 `readGridCardWidth` 读到真实卡宽，而非 CSS 自然列宽。
        gridTemplateColumns: tracks.map((width) => `${width}px`).join(' ') || undefined
      }}
    >
      {virtualRows.map((virtualRow) => {
        const startIndex = virtualRow.index * trackCount
        const rowItems = items.slice(startIndex, startIndex + trackCount)
        const rowTracks = multiRow ? tracks : tracks.slice(0, rowItems.length)
        // 本行卡片都播放过进场（从视口外滚回）→ 标 off，由卡片 CSS 跳过重播；
        // 行内仍有首次出现的卡片时不标，保持原进场动画。
        const enterOff =
          rowItems.length > 0 && rowItems.every((item) => playedKeys.has(getKey(item)))
        const rowStyle: CSSProperties = {
          position: 'absolute',
          top: paddingTop + centerOffset + (virtualRow.start - scrollMargin),
          left: metrics?.paddingLeft ?? 0,
          right: metrics?.paddingRight ?? 0,
          display: 'grid',
          gridTemplateColumns: rowTracks.map((width) => `${width}px`).join(' '),
          columnGap: metrics?.columnGap,
          rowGap: 0,
          padding: 0,
          overflow: 'visible'
        }
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-row-key={String(virtualRow.key)}
            data-enter={enterOff ? 'off' : undefined}
            ref={virtualizer.measureElement}
            className={className}
            style={rowStyle}
          >
            {rowItems.map((item) => (
              <Fragment key={getKey(item)}>{renderCard(item)}</Fragment>
            ))}
          </div>
        )
      })}
      {/* 零高量尺：同 class、同内容宽；子项跨列复现 auto-fit 折叠后的实际列宽。 */}
      <div
        aria-hidden="true"
        ref={rulerRef}
        className={className}
        style={{
          position: 'absolute',
          inset: 0,
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          overflow: 'hidden'
        }}
      >
        <div style={{ gridColumn: `1 / span ${rulerSpan}`, height: 0, minHeight: 0 }} />
      </div>
      {/* 零高占位：空数据时也撑住根网格的轨道，供 `readGridCardWidth` 读到非零列宽。 */}
      <div aria-hidden="true" style={{ gridColumn: '1 / -1', height: 0, minHeight: 0 }} />
    </div>
  )
}

export default VirtualCardGrid
