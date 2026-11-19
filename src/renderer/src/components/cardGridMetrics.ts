/**
 * 通用卡片网格的布局辅助（设定档案五域 / 伏笔 / 书架共用，AGENTS §9）：
 * - `readGridCardWidth`：读取单卡内容可用宽；
 * - `useColumnFlip`：列数切换时按卡片矩形做 FLIP 补间。
 */
import { useCallback, useEffect, useRef } from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'

/**
 * 读取单卡内容可用宽。
 *
 * `auto-fit` 网格各列等宽，`grid-template-columns` 的解析值即各列实际像素宽（列数随容器宽
 * 变化时该值同步变化），取首列即可代表所有卡片；再减去卡片自身左右内边距，得到卡内单行
 * 胶囊容器的可用宽。观察与「拖拽分隔条期间暂停测量」由 `useStableMeasure` 统一处理
 * （逐帧写回测量值会让列宽 / 胶囊折行 / 卡高 / 滚动条互相牵动，形成抖动闭环）。
 * 该值只作布局签名用（真实容量仍由 `useChipOverflow` 在 DOM 上实测），故取整避免抖动。
 */
export function readGridCardWidth(grid: HTMLElement): number {
  const card = grid.firstElementChild as HTMLElement | null
  const cardStyle = card === null ? null : window.getComputedStyle(card)
  const paddingX =
    (Number.parseFloat(cardStyle?.paddingLeft ?? '') || 0) +
    (Number.parseFloat(cardStyle?.paddingRight ?? '') || 0)
  const columnWidth = Number.parseFloat(window.getComputedStyle(grid).gridTemplateColumns)
  const base = Number.isFinite(columnWidth) ? columnWidth : (card?.offsetWidth ?? 0)
  return Math.max(0, Math.round(base - paddingX))
}

/* ============================================================
   列数切换 FLIP
   ------------------------------------------------------------------
   换列会增删网格轨道：`grid-template-columns` 无法插值，行容器又按列数重建，跨容器的
   位置变化只能按卡片 key 对齐前后矩形，再用 WAAPI 补间 `transform`。尺寸用 `scale`
   表达而**不写 width / height**：后者会触发布局，让虚拟化的行高测量读到动画中间值；
   transform 不影响布局，被测量的行容器本身也不加 transform。这里的 transform 是布局
   过渡，不是 hover 反馈（AGENTS §8.8 禁止的位移仅指卡片 hover 态）。
   ============================================================ */

type CardKey = string | number

interface CardRect {
  left: number
  top: number
  width: number
  height: number
}

export interface ColumnFlipParams<T> {
  root: HTMLElement
  items: readonly T[]
  getKey: (item: T) => CardKey
  trackCount: number
  /** 换列提交后虚拟器的最新行数据（行高已被 ref 回调测完，start 可能不同于渲染值）。 */
  rows: readonly VirtualItem[]
  totalSize: number
  paddingTop: number
  scrollMargin: number
  viewportInner: number
  centerVertically: boolean
}

export interface ColumnFlip<T> {
  /** 列数变化前记下仍在 DOM 里的卡片矩形（只按卡片 key 对齐，不依赖行容器）。 */
  capture: (
    root: HTMLElement,
    items: readonly T[],
    getKey: (item: T) => CardKey,
    trackCount: number
  ) => void
  /** 换列后的布局提交里补间；没有待处理快照 / 减少动效时是空操作。 */
  play: (params: ColumnFlipParams<T>) => void
}

/** 令牌缺失时的兜底时长，与 theme.css 的 `--dur-slow` 默认值一致。 */
const FALLBACK_DURATION_MS = 240

/** 读取时长令牌；`240ms` 与 `0.24s` 两种写法都接受。 */
function durationMs(value: string): number {
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount) || amount <= 0) return FALLBACK_DURATION_MS
  return value.trim().endsWith('ms') ? amount : amount * 1000
}

export function useColumnFlip<T>(): ColumnFlip<T> {
  const pendingRef = useRef<Map<CardKey, CardRect> | null>(null)
  const animationsRef = useRef<Set<Animation>>(new Set())

  useEffect(() => {
    const animations = animationsRef.current
    return () => {
      for (const animation of animations) animation.cancel()
      animations.clear()
    }
  }, [])

  const capture = useCallback(
    (
      root: HTMLElement,
      items: readonly T[],
      getKey: (item: T) => CardKey,
      trackCount: number
    ): void => {
      const rects = new Map<CardKey, CardRect>()
      for (const row of root.querySelectorAll<HTMLElement>('[data-index]')) {
        const startIndex = Number(row.dataset.index) * trackCount
        const children = row.children
        for (let offset = 0; offset < children.length; offset += 1) {
          const item = items[startIndex + offset]
          if (item === undefined) continue
          const rect = children[offset].getBoundingClientRect()
          rects.set(getKey(item), {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
          })
        }
      }
      pendingRef.current = rects.size === 0 ? null : rects
    },
    []
  )

  const play = useCallback((params: ColumnFlipParams<T>): void => {
    const previous = pendingRef.current
    pendingRef.current = null
    if (previous === null) return
    for (const animation of animationsRef.current) animation.cancel()
    animationsRef.current.clear()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const {
      root,
      items,
      getKey,
      trackCount,
      rows,
      totalSize,
      paddingTop,
      scrollMargin,
      viewportInner,
      centerVertically
    } = params
    const computed = window.getComputedStyle(root)
    const duration = durationMs(computed.getPropertyValue('--dur-slow'))
    const easing = computed.getPropertyValue('--ease-out').trim() || 'ease-out'
    // 行容器是本帧新建的：行高刚在 ref 回调里测完，行 top 会在下一次提交前按新测量
    // 校正。先算出该校正量，补间的终点才落在真实的新位置上。
    const starts = new Map<number, number>()
    for (const row of rows) starts.set(row.index, row.start)
    const center =
      centerVertically && totalSize < viewportInner ? (viewportInner - totalSize) / 2 : 0

    for (const row of root.querySelectorAll<HTMLElement>('[data-index]')) {
      const index = Number(row.dataset.index)
      const start = starts.get(index)
      if (start === undefined) continue
      const shift =
        paddingTop + center + start - scrollMargin - (Number.parseFloat(row.style.top) || 0)
      const children = row.children
      for (let offset = 0; offset < children.length; offset += 1) {
        const item = items[index * trackCount + offset]
        if (item === undefined) continue
        const before = previous.get(getKey(item))
        if (before === undefined) continue
        const element = children[offset] as HTMLElement
        // 换列时行容器重建，卡片自身的 wf-enter-up 会重播；已有卡片改由 FLIP 表达
        // 运动，停掉进场动画（元素随下次重建时内联样式自然消失）。
        element.style.animation = 'none'
        const after = element.getBoundingClientRect()
        if (after.width === 0 || after.height === 0 || before.width === 0 || before.height === 0) {
          continue
        }
        const dx = before.left - after.left
        const dy = before.top - after.top - shift
        const scaleX = before.width / after.width
        const scaleY = before.height / after.height
        if (
          Math.abs(dx) < 0.5 &&
          Math.abs(dy) < 0.5 &&
          Math.abs(scaleX - 1) < 0.005 &&
          Math.abs(scaleY - 1) < 0.005
        ) {
          continue
        }
        const animation = element.animate(
          [
            {
              transformOrigin: '0 0',
              transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`
            },
            { transformOrigin: '0 0', transform: 'none' }
          ],
          { duration, easing }
        )
        animationsRef.current.add(animation)
        const forget = (): void => {
          animationsRef.current.delete(animation)
        }
        animation.addEventListener('finish', forget)
        animation.addEventListener('cancel', forget)
      }
    }
  }, [])

  return { capture, play }
}
