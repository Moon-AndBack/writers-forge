/**
 * 通用「卡片网格 + 行级虚拟滚动」（AGENTS §9：多处网格共用一套实现）。
 *
 * 只渲染视口内的整行卡片，其余行由外层高度占位；列宽 / 间距 / 对齐全部**沿用调用方
 * 现有的网格 CSS**（`.wf-card-grid` / `.book-grid` / `.entities-overview-grid`），
 * 不在组件里另立一套尺寸口径：
 *
 * - **列轨道实测**：根节点仍是原网格元素（保留类名与 CSS），内部另放一个零高「量尺」
 *   （同 class、同内容宽的绝对定位网格），其中只有一个按 `min(条目数, 64)` 跨列的 0 高项。
 *   量尺与根节点共用同一份网格 CSS，读量尺的 `gridTemplateColumns` 就是**实际卡片列宽**：
 *   书架 `auto-fit` 在条目数不足一整行时折叠空轨道、把剩余轨道拉宽到上限，量尺的跨列数
 *   正好复现这一折叠结果；`.wf-card-grid` 的 `auto-fill` 保留空轨道，量尺直接给出标准列宽。
 * - **按行虚拟**（不是按列）：行高由该行最高卡片决定，虚拟项即一行；卡片在行内仍是
 *   网格子项，因此 `useChipOverflow` 的容器实测、`useStableMeasure` 的布局签名都不变。
 * - **滚动容器自动识别**：根节点自身可滚动（书架 `.book-grid`）就用自身；否则向上找最近的
 *   `overflow-y: auto / scroll` 祖先（`.editor-scroll` / `.rp-card--list`），并用
 *   `scrollMargin` 对齐列表起点，**不改调用方的外层滚动结构**。
 * - **滚动即收浮卡**：跨过 `onScroll` 给调用方关闭依赖卡片 DOM 的悬停卡（虚拟化会卸载
 *   视口外卡片，旧锚点会变成悬空快照）。
 *
 * 行容器复制调用方类名，故 `.entities-overview-grid > .dossier-card` 这类直接子选择器
 * 仍然命中（卡片是行容器的直接子元素）。
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
  /** 每列实际像素宽（长度即列数；`auto-fit` 折叠后为有效列数）。 */
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
 * 读取列 / 间距 / 内衬；无 CSS 轨道时按最小卡宽兜底。
 *
 * 列宽从**零高量尺**读（同一份类名、同一内容宽），而不是根节点：根节点的子行是绝对定位，
 * 不适合承担 `auto-fit`「空轨道折叠」的判定；量尺内只有一个按条目数跨列的常规网格项，
 * 折叠结果与改造前的自然网格一致。
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
  const tracks = readTracks(trackStyle.gridTemplateColumns)
  if (tracks.length === 0) {
    // 没有网格类（或轨道尚未解析）时按最小卡宽均分，保证组件独立可用。
    const contentWidth = Math.max(0, el.clientWidth - paddingLeft - paddingRight)
    const gapValue = columnGap > 0 ? columnGap : fallbackGap
    const min = Math.max(1, minCardWidth)
    const count = Math.max(1, Math.floor((contentWidth + gapValue) / (min + gapValue)))
    const width = Math.max(0, (contentWidth - gapValue * (count - 1)) / count)
    for (let index = 0; index < count; index += 1) tracks.push(width)
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
    const read = (): void => {
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
      setMetrics((prev) => (prev !== null && sameMetrics(prev, next) ? prev : next))
    }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [className, items.length, scrollEl, minCardWidth, gap])

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
  // 多行时最后一行仍用完整轨道集（空轨道保留），与首行严格对位；只有整张网格
  // 不足一行时才按条目数裁轨道（复现 auto-fit 折叠后轨道被拉宽的既有行为）。
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

  return (
    <div
      {...gridProps}
      ref={setRoot}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={className}
      style={{ position: 'relative', height: paddingTop + contentHeight + paddingBottom }}
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
      {/* 零高占位：让根网格自身保留全部列轨道，供 `readGridCardWidth` 读到非零列宽。 */}
      <div aria-hidden="true" style={{ gridColumn: '1 / -1', height: 0, minHeight: 0 }} />
    </div>
  )
}

export default VirtualCardGrid
