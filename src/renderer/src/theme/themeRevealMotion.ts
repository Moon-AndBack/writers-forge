/**
 * 主题切换覆盖层的时长原语。
 *
 * `themeReveal.ts` 负责动画编排；这里提供 `theme.css` 的 `--dur-theme-*`
 * 解析（含与令牌一致的回退值）与可提前取消的停留计时。拆出后编排文件保持在
 * 500 行以内（AGENTS §3 单文件上限）。
 */

/** 与 `theme.css` 的 `--dur-theme-reveal` 对齐；令牌读取失败时的回退值（毫秒）。 */
const FALLBACK_DURATION = 400
/** 与 `theme.css` 的 `--dur-theme-badge-in` 对齐；图标入场回退值（毫秒）。 */
const FALLBACK_BADGE_IN = 300
/** 与 `theme.css` 的 `--dur-theme-badge-hold` 对齐；图标停留回退值（毫秒）。 */
const FALLBACK_BADGE_HOLD = 700
/** 与 `theme.css` 的 `--dur-theme-badge-out` 对齐；图标淡出回退值（毫秒）。 */
const FALLBACK_BADGE_OUT = 250
/** 与 `theme.css` 的 `--ease` 对齐（对称曲线）；令牌读取失败时的回退值。 */
const FALLBACK_EASING = 'cubic-bezier(0.33, 0, 0.67, 1)'
/** 与 `theme.css` 的 `--ease-out` 对齐（进场曲线）；令牌读取失败时的回退值。 */
const FALLBACK_EASING_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** 半档阶段比例（仅升遮罩）：0.5 × --dur-theme-reveal。 */
const HALF_PHASE_RATIO = 0.5

export interface RevealMotion {
  /** 遮罩三阶段分母：模糊 1×、升遮罩 0.5×、tint 交叉 1×。 */
  duration: number
  badgeIn: number
  badgeHold: number
  badgeOut: number
  easing: string
  easingOut: string
}

/** 解析毫秒令牌；0 / NaN 视为无效（时长为 0 就是瞬切，正是本函数要避免的结果）。 */
function readDuration(styles: CSSStyleDeclaration, name: string, fallback: number): number {
  const value = Number.parseFloat(styles.getPropertyValue(name))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 读取动画时长 / 缓动：读令牌而非写字面量（`theme.css` 约定禁止裸时长），
 * 令牌缺失 / 解析失败时回退到与当前令牌一致的常量，保证动画照常可见。
 */
export function readRevealMotion(): RevealMotion {
  const styles = getComputedStyle(document.documentElement)
  const easing = styles.getPropertyValue('--ease').trim()
  const easingOut = styles.getPropertyValue('--ease-out').trim()

  return {
    duration: readDuration(styles, '--dur-theme-reveal', FALLBACK_DURATION),
    badgeIn: readDuration(styles, '--dur-theme-badge-in', FALLBACK_BADGE_IN),
    badgeHold: readDuration(styles, '--dur-theme-badge-hold', FALLBACK_BADGE_HOLD),
    badgeOut: readDuration(styles, '--dur-theme-badge-out', FALLBACK_BADGE_OUT),
    easing: easing.length > 0 ? easing : FALLBACK_EASING,
    easingOut: easingOut.length > 0 ? easingOut : FALLBACK_EASING_OUT
  }
}

/** 半档阶段时长（仅升遮罩）：0.5 × --dur-theme-reveal，取整毫秒。 */
export function halfPhase(duration: number): number {
  return Math.max(1, Math.round(duration * HALF_PHASE_RATIO))
}

/** 可被新一轮切换 / 销毁提前唤醒的停留槽位。 */
export interface HoldSlot {
  /** 当前停留计时的取消器；空闲时为 null。 */
  hold: (() => void) | null
}

/**
 * 图标停留计时。新一轮切换复用覆盖层时由 `stopAnimations()` 调用
 * `cancelHold()` 提前唤醒，编排在序号守卫处退出，不会让旧计时器拖到新动画里。
 */
export function waitHold(ctx: HoldSlot, duration: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      ctx.hold = null
      resolve()
    }, duration)

    ctx.hold = () => {
      window.clearTimeout(timer)
      ctx.hold = null
      resolve()
    }
  })
}

export function cancelHold(ctx: HoldSlot): void {
  ctx.hold?.()
}
