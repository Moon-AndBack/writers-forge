import { useEffect, useSyncExternalStore } from 'react'

/**
 * 「本次程序打开」的码字统计（状态栏胶囊的唯一数据源）。
 *
 * 口径：
 * - 只由章节正文编辑器调用 `recordChapterEdit`；大纲 / 剧情 / 设定等模块不计数。
 * - 字数 = 有效字**净增**（与 `daily_stats` / `docWordLimit.docCharCount` 同口径），
 *   删除会扣减，展示时 clamp 到 0。
 * - 活跃时长只在正文事务时刻结算（无常驻定时器）：单次间隔最多计 5s；
 *   停笔超过 5s、全局无操作超过 60s、或窗口失焦 / 隐藏时按闲时处理。
 * - 状态栏胶囊自启动即常驻（书架页 / 写作页共用），零值显示 0 字；删字 / 切页都不隐藏。
 * - 速度 = 净增字数 ÷ 活跃时长（字 / 时），四舍五入。空闲时不重算，
 *   故速度不会随停留时间滑落；下次正文事务才刷新。
 * - 总时长 = 首次码字至今的墙钟时长；空闲时长 = `max(0, 总时长 - 活跃时长)`。
 *   后两者随时间增长，故详情浮层打开时用 `getLiveSnapshot()` 现算（无常驻定时器）。
 *
 * 订阅口径与 `proofreadHits` 一致：`getSnapshot` 返回稳定引用，内容变化才换对象。
 */

export interface WritingSessionSnapshot {
  /** 净增有效字（可能为负，展示方自行 clamp）。 */
  chars: number
  /** 每小时码字速度（活跃时长不足 1s 或净增为负时为 0）。 */
  speed: number
  /** 累计活跃时长（毫秒；停笔 / 失焦间隔已按阈值剔除）。 */
  activeMs: number
  /** 累计空闲时长（毫秒）：`max(0, totalMs - activeMs)`。 */
  idleMs: number
  /** 首次码字至今的总时长（毫秒；尚未码字时为 0）。 */
  totalMs: number
}

/** 正文停笔阈值：间隔超过 5s 时只按 5s 计入活跃时长。 */
const EDIT_PAUSE_MS = 5_000
/** 全局无操作阈值：超过 60s 视为闲时，该段间隔计 0。 */
const IDLE_MS = 60_000
/** 速度展示门槛：净增有效字不足 20 时只显示字数。 */
export const SPEED_MIN_CHARS = 20
/** 活跃时长下限：首个字的事务间隔为 0，不足 1s 时速度无意义。 */
const MIN_ACTIVE_MS = 1_000
/** AI 回插正文的事务标记（`applyToEditor` 写入，tracker 据此跳过）。 */
export const AI_APPLY_META = 'aiApply'

let snapshot: WritingSessionSnapshot = {
  chars: 0,
  speed: 0,
  activeMs: 0,
  idleMs: 0,
  totalMs: 0
}
const listeners = new Set<() => void>()

let chars = 0
let activeMs = 0
/** 首次码字时间戳；0 = 本次启动尚未写过（总时长 / 空闲时长的起点）。 */
let firstEditAt = 0
/** 上一次计入的正文事务时间戳；0 = 本次启动尚未写过。 */
let lastEditAt = 0
/** 最近一次全局输入（键鼠 / 滚轮 / 焦点）时间戳。 */
let lastActivityAt = Date.now()
/** 自上次正文事务以来窗口是否失焦 / 隐藏（期间的间隔按闲时处理）。 */
let lostFocus = false

function computeSpeed(): number {
  if (chars <= 0 || activeMs < MIN_ACTIVE_MS) return 0
  return Math.round(chars / (activeMs / 3_600_000))
}

/** 首次码字至今的墙钟时长（毫秒）；尚未码字为 0。 */
function computeTotalMs(now: number): number {
  return firstEditAt === 0 ? 0 : Math.max(0, now - firstEditAt)
}

function publish(): void {
  const speed = computeSpeed()
  const totalMs = computeTotalMs(Date.now())
  const idleMs = Math.max(0, totalMs - activeMs)
  if (
    snapshot.chars === chars &&
    snapshot.speed === speed &&
    snapshot.activeMs === activeMs &&
    snapshot.totalMs === totalMs
  ) {
    return
  }
  snapshot = { chars, speed, activeMs, idleMs, totalMs }
  for (const listener of listeners) listener()
}

/**
 * 记录一次章节正文事务的净增有效字（唯一写入口，由 `useWritingSessionTracker` 调用）。
 *
 * 活跃时长累计规则（全在事务时刻结算，不做常驻定时器）：
 * - 本次启动首次码字：间隔计 0；
 * - 间隔 ≤ 5s：整段计入（连续输入的击键间隔）；
 * - 停笔 5–60s：只计 5s（保留停笔前最后一小段思考，不把整段空闲计入）；
 * - 停笔 > 60s / 全局无操作 > 60s / 窗口曾失焦或隐藏：计 0（视为闲时，另起一段）。
 *
 * 全局 `keydown` 先于文档事务触发，会把 `lastActivityAt` 刷成「现在」；
 * 故闲时判定同时以「距上次正文事务的间隔」为准，避免 >60s 的停笔被漏判。
 */
export function recordChapterEdit(delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) return

  const now = Date.now()
  if (lastEditAt === 0) firstEditAt = now
  let gap = 0
  if (lastEditAt !== 0) {
    const sinceEdit = Math.max(0, now - lastEditAt)
    const idleSinceActivity = now - lastActivityAt > IDLE_MS
    gap =
      lostFocus || idleSinceActivity || sinceEdit > IDLE_MS ? 0 : Math.min(sinceEdit, EDIT_PAUSE_MS)
  }

  chars += delta
  activeMs += gap
  lastEditAt = now
  lastActivityAt = now
  lostFocus = false
  publish()
}

/** 订阅快照变化（`useSyncExternalStore` 用）。 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 读取当前快照（稳定引用：内容不变即同一对象）。 */
function getSnapshot(): WritingSessionSnapshot {
  return snapshot
}

/**
 * 读取实时快照（详情浮层打开时调用一次）：`totalMs` / `idleMs` 按 `Date.now()` 现算。
 *
 * 订阅快照只在正文事务时发布，`totalMs` / `idleMs` 会随时间继续增长；
 * 这里按需现算即可，不引入常驻定时器，也不影响 `useSyncExternalStore` 的稳定引用。
 */
export function getLiveSnapshot(): WritingSessionSnapshot {
  const totalMs = computeTotalMs(Date.now())
  const active = Math.min(activeMs, totalMs)
  return {
    chars,
    speed: computeSpeed(),
    activeMs: active,
    idleMs: Math.max(0, totalMs - active),
    totalMs
  }
}

/** 码字统计快照 hook（状态栏胶囊用）。 */
export function useWritingSession(): WritingSessionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * 全局活动监听（App 顶层挂载一次）：只刷新时间戳与失焦标记，
 * 不 `preventDefault` / `stopPropagation`，不改变任何既有交互。
 * capture + passive：先于页面处理器记录，且不阻止默认行为。
 * 卸载时不重置统计（切书架 / 回写作页仍是同一会话）。
 */
export function useGlobalWritingSessionActivity(): void {
  useEffect(() => {
    const markActive = (): void => {
      lastActivityAt = Date.now()
    }
    const markInactive = (): void => {
      lostFocus = true
      lastActivityAt = Date.now()
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') markInactive()
      else markActive()
    }
    const options: AddEventListenerOptions = { capture: true, passive: true }

    window.addEventListener('keydown', markActive, options)
    window.addEventListener('pointerdown', markActive, options)
    window.addEventListener('pointermove', markActive, options)
    window.addEventListener('wheel', markActive, options)
    window.addEventListener('blur', markInactive)
    window.addEventListener('focus', markActive)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.removeEventListener('keydown', markActive, options)
      window.removeEventListener('pointerdown', markActive, options)
      window.removeEventListener('pointermove', markActive, options)
      window.removeEventListener('wheel', markActive, options)
      window.removeEventListener('blur', markInactive)
      window.removeEventListener('focus', markActive)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])
}
