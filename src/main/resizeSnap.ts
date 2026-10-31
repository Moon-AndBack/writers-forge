import type { BrowserWindow } from 'electron'
import { logger } from './logger'

/** 宽度磁吸域日志 scope。 */
const log = logger.scope('resizeSnap')

/**
 * 宽度磁吸（吸附到恰好容纳整数张卡片，左右无余量）：
 * - 仅书籍页通过 `window:snap:set` 显式启用；其余页面无配置即完全旁路；
 * - 在 `will-resize` 中用 `event.preventDefault()` + `win.setBounds()` 改写宽度；
 * - 单位是 DIP：`getBounds/setBounds` 均为 DIP，默认 `zoomFactor=1` 时 1 CSS px = 1 DIP，
 *   不做任何 `devicePixelRatio` 换算；所有宽度取 `Math.round`（Rectangle 要求整数）；
 * - `setBounds` 不会再次触发 `will-resize`（Electron 明确保证），无递归回环。
 */

export interface SnapConfig {
  /** 单张卡片宽度（px，含卡片自身边框） */
  cardWidth: number
  /** 列间距（px） */
  columnGap: number
  /** 窗口外宽与 `.book-grid` 内容盒宽之差（窗口边框 + padding + 滚动条） */
  overhead: number
  /** 档位上限（通常为当前卡片数；只有 N ≤ 卡片数才真正左右无余量） */
  maxColumns: number
  /** 预留比例系数（暂未启用） */
  ratio?: number
}

export interface SnapStatus {
  enabled: boolean
  /** 当前配置；未启用时为 null */
  config: SnapConfig | null
  /** 当前锁定的列数；未锁定为 null */
  locked: number | null
}

interface SnapState {
  enabled: boolean
  config: SnapConfig | null
  locked: number | null
}

/** 进入吸附的阈值（DIP）：与目标档宽度之差不超过此值即吸附 */
export const SNAP_ENTER = 12
/** 解除吸附的阈值（DIP）：与锁定档宽度之差超过此值才解锁（滞后，避免抖动） */
export const SNAP_EXIT = 24

/** 按注册顺序记录 `will-resize` 监听器，便于幂等判断与移除 */
const resizeListeners = new WeakMap<
  BrowserWindow,
  (
    event: Electron.Event,
    newBounds: Electron.Rectangle,
    details: Electron.WillResizeDetails
  ) => void
>()

/** 各窗口的吸附状态；未启用时为 `{ enabled: false, config: null, locked: null }` */
const snapStates = new WeakMap<BrowserWindow, SnapState>()

function getState(win: BrowserWindow): SnapState {
  let state = snapStates.get(win)
  if (!state) {
    state = { enabled: false, config: null, locked: null }
    snapStates.set(win, state)
  }
  return state
}

/** 校验渲染层传入的配置，非法返回 null（NaN / Infinity / 负值 / 非对象一律拒绝） */
export function parseSnapConfig(value: unknown): SnapConfig | null {
  if (typeof value !== 'object' || value === null) return null

  const { cardWidth, columnGap, overhead, maxColumns, ratio } = value as Partial<SnapConfig>
  if (
    typeof cardWidth !== 'number' ||
    !Number.isFinite(cardWidth) ||
    cardWidth <= 0 ||
    typeof columnGap !== 'number' ||
    !Number.isFinite(columnGap) ||
    columnGap < 0 ||
    typeof overhead !== 'number' ||
    !Number.isFinite(overhead) ||
    overhead < 0 ||
    typeof maxColumns !== 'number' ||
    !Number.isInteger(maxColumns) ||
    maxColumns < 1
  ) {
    return null
  }

  const config: SnapConfig = { cardWidth, columnGap, overhead, maxColumns }
  if (ratio !== undefined) {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio <= 0) return null
    config.ratio = ratio
  }
  return config
}

/** N 列时恰好容纳整数张卡片的窗口宽度（DIP，已取整） */
export function snapWidth(config: SnapConfig, columns: number): number {
  return Math.round(config.overhead + columns * config.cardWidth + (columns - 1) * config.columnGap)
}

/** 所有合法档位的窗口宽度（升序；N = 1..maxColumns） */
export function snapWidthsForConfig(config: SnapConfig): number[] {
  const widths: number[] = []
  for (let n = 1; n <= config.maxColumns; n += 1) widths.push(snapWidth(config, n))
  return widths
}

export interface SnapDecision {
  /** 锁定的列数；null 表示不吸附 */
  locked: number | null
  /** 需要吸附到的窗口宽度；null 表示维持拖动自由度 */
  width: number | null
  /** 本次决策是否导致锁定状态变化 */
  changed: boolean
}

/**
 * 纯函数：给定「当前拖动到的宽度」与「上一帧锁定档」，计算本次决策。
 * 可独立测试（探针即断言此函数）。
 *
 * - 已锁定且未越 EXIT → 维持锁定并吸附（即使偏离档位也拉回）；
 * - 已锁定但越 EXIT → 解锁（本次由通用分支重新寻档，允许跳到别的档或自由）；
 * - 未锁定且距最近档 ≤ ENTER → 锁定并吸附；
 * - 未锁定且距任何档都 > ENTER → 不吸附（width = null）。
 * 只有 N ≤ maxColumns 的档参与最近档判定。
 */
export function decideSnap(config: SnapConfig, width: number, locked: number | null): SnapDecision {
  const candidateLocked = locked !== null && locked >= 1 && locked <= config.maxColumns

  if (candidateLocked && Math.abs(width - snapWidth(config, locked)) <= SNAP_EXIT) {
    return { locked, width: snapWidth(config, locked), changed: false }
  }

  let nearest: number | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let n = 1; n <= config.maxColumns; n += 1) {
    const distance = Math.abs(width - snapWidth(config, n))
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = n
    }
  }

  if (nearest !== null && nearestDistance <= SNAP_ENTER) {
    return { locked: nearest, width: snapWidth(config, nearest), changed: nearest !== locked }
  }

  return { locked: null, width: null, changed: locked !== null }
}

/**
 * 处理一次 `will-resize`：命中吸附时用 `preventDefault()` 拦截系统本次宽度，
 * 再复位到目标宽度；`setBounds` 抛错则不拦截，让窗口继续按用户拖动，避免冻住。
 */
function handleWillResize(
  win: BrowserWindow,
  event: Electron.Event,
  newBounds: Electron.Rectangle,
  details: Electron.WillResizeDetails
): void {
  const state = getState(win)
  if (!state.enabled || !state.config) return
  if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return

  // Windows 上 edge 为 'bottom' 时不改变宽度；'top' 不在 Electron 取值范围内，一并屏蔽
  if (details.edge === 'bottom' || (details.edge as string) === 'top') return

  const decision = decideSnap(state.config, newBounds.width, state.locked)
  if (decision.width === null || decision.locked === null) {
    state.locked = null
    return
  }

  const current = win.getBounds()
  const roundedWidth = Math.round(decision.width)
  // 系统本次提议的宽度已等于目标且锁定档未变：无需拦截，也不重复 setBounds
  if (newBounds.width === roundedWidth && decision.locked === state.locked) {
    return
  }

  // 左边缘拖动时右边缘固定：补偿 x，使右边缘保持不动
  const targetX = details.edge.includes('left')
    ? current.x + current.width - roundedWidth
    : current.x

  try {
    win.setBounds({ x: Math.round(targetX), width: roundedWidth })
  } catch (error) {
    // setBounds 失败不 preventDefault，放弃本次吸附（拖拽中可能高发，故 warn）。
    log.warn('磁吸 setBounds 失败，放弃本次吸附', { width: roundedWidth, error })
    return
  }

  state.locked = decision.locked
  event.preventDefault()
}

/** 注册 `will-resize` 监听（幂等：同窗口重复调用不叠加监听） */
export function registerResizeSnap(win: BrowserWindow): void {
  if (resizeListeners.has(win)) return

  const listener = (
    event: Electron.Event,
    newBounds: Electron.Rectangle,
    details: Electron.WillResizeDetails
  ): void => {
    handleWillResize(win, event, newBounds, details)
  }

  resizeListeners.set(win, listener)
  win.on('will-resize', listener)
}

/** 启用吸附并写入配置（开启或换档时清除旧锁定） */
export function enableSnap(win: BrowserWindow, config: SnapConfig): SnapStatus {
  const state = getState(win)
  state.enabled = true
  state.config = config
  state.locked = null
  return { enabled: true, config, locked: null }
}

/** 关闭吸附（离开书籍页时调用），清除配置使后续拖拽完全自由 */
export function disableSnap(win: BrowserWindow): SnapStatus {
  const state = getState(win)
  state.enabled = false
  state.config = null
  state.locked = null
  return { enabled: false, config: null, locked: null }
}

/** 读取当前吸附状态；未启用时返回 null */
export function getSnapStatus(win: BrowserWindow): SnapStatus | null {
  const state = getState(win)
  if (!state.enabled || !state.config) return null
  return { enabled: true, config: state.config, locked: state.locked }
}
