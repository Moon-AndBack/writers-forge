/**
 * 主题切换的**全屏模糊覆盖层**（不再使用 View Transitions）。
 *
 * 亚克力窗口下 `.shell` 只有 50% 不透明，剩余底色来自 DWM 材质；旧方案在
 * View Transition 快照前就切换 `nativeTheme.themeSource`，原生背板直接跳变，
 * 于是「底色先变、三栏后变」。本方案改为严格串行（总 1.2s）：
 *
 * ```
 * __blur 淡入（--dur-theme-reveal，55% 旧主题 tint，仍见模糊）
 *   → __veil 升到完全不透明（0.5 × 令牌，100% 旧主题纯色）
 *   → 才调用主进程 theme:apply（system 档 await 权威明暗）
 *   → 同一帧 commit：dataset.theme + flushSync + 目标 tint + 大图标
 *   → __tint 0 → 1（--dur-theme-reveal）：旧纯色交叉到新纯色
 *   → 覆盖层淡出（0.5 × 令牌），图标缩放淡出
 *   → 移除覆盖层，恢复交互
 * ```
 *
 * 关键是 `theme:apply` 必须等 __veil 完全不透明后才发出，否则原生背板仍会在
 * 遮罩几乎透明时跳变。显式档只用它同步原生材质，不采用其 `resolvedTheme`
 * （DWM 明暗，sage / honey 下不等于应用主题）。
 *
 * 降级（直接 resolve + commit，不显示遮罩）：减少动效、页面隐藏、覆盖层创建
 * 抛错、动画抛错 / 被中断（已解析时补提交一次，幂等）。`theme:apply` 超过
 * `APPLY_TIMEOUT` 按本地解析强制提交并淡出；遮罩可见期间持续拦截指针与键盘。
 *
 * 快速连切由序号守卫：旧请求在 await 点发现序号过期即退出；可见阶段的覆盖层
 * 复用（对齐旧主题色、目标层与图标归零后重放，不重新模糊），淡出阶段则新建。
 */

import type { IconNode } from 'lucide'
import { THEME_ICONS } from './themeIcons'
import type { ResolvedThemeId } from './themes'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SVG_NS = 'http://www.w3.org/2000/svg'
/** 覆盖层上的旧 / 新主题底色变量：`__veil` / `__tint` 分别取用，均为不透明色。 */
const TINT_VAR = '--wf-theme-reveal-tint'
const TARGET_TINT_VAR = '--wf-theme-reveal-target'

/** 与 `theme.css` 的 `--dur-theme-reveal` 对齐；令牌读取失败时的回退值（毫秒）。 */
const FALLBACK_DURATION = 400
/** 与 `theme.css` 的 `--ease` 对齐（对称曲线）；令牌读取失败时的回退值。 */
const FALLBACK_EASING = 'cubic-bezier(0.33, 0, 0.67, 1)'
/** 与 `theme.css` 的 `--ease-out` 对齐（进场曲线）；令牌读取失败时的回退值。 */
const FALLBACK_EASING_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
/** 半档阶段比例（升遮罩 / 淡出）：合计 3 × 400ms = 1.2s。 */
const HALF_PHASE_RATIO = 0.5
/** `theme:apply` 安全超时（毫秒，非动画时长）：IPC 卡死时按 `fallback()` 提交
 * 并淡出，避免遮罩停在纯色上无法操作。 */
const APPLY_TIMEOUT = 3000

type RevealPhase = 'blurring' | 'veiling' | 'revealing' | 'fading'

interface RevealContext {
  root: HTMLDivElement
  blur: HTMLDivElement
  veil: HTMLDivElement
  tint: HTMLDivElement
  badge: HTMLDivElement
  badgeInner: HTMLDivElement
  animations: Set<Animation>
  phase: RevealPhase
  /** 模糊层是否已经完成入场（复用时跳过重新模糊）。 */
  blurVisible: boolean
  /** 旧主题遮罩是否已完全不透明（复用时跳过重新升遮罩）。 */
  veilOpaque: boolean
  keyBlock: ((event: KeyboardEvent) => void) | null
}

export interface ThemeRevealRequest {
  /** 遮罩内解析目标主题；system 档在此 await 主进程的权威明暗。 */
  resolve: () => Promise<ResolvedThemeId>
  /** `resolve` 抛错 / 超时时的同步回退（一般用当前已知系统明暗解析）。 */
  fallback: () => ResolvedThemeId
  /** 同一帧写入 `dataset.theme` 并 flushSync 提交 React 状态。 */
  commit: (resolved: ResolvedThemeId) => void
}

/** 每次 `runThemeReveal` / `cancelThemeReveal` 自增，用于丢弃过期异步结果。 */
let revealSequence = 0
let activeContext: RevealContext | null = null

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * 读取动画时长 / 缓动：读令牌而非写字面量（`theme.css` 约定禁止裸时长），
 * 令牌缺失 / 解析失败时回退到与当前令牌一致的常量，保证动画照常可见。
 */
function readRevealMotion(): { duration: number; easing: string; easingOut: string } {
  const styles = getComputedStyle(document.documentElement)
  const duration = Number.parseFloat(styles.getPropertyValue('--dur-theme-reveal'))
  const easing = styles.getPropertyValue('--ease').trim()
  const easingOut = styles.getPropertyValue('--ease-out').trim()

  return {
    // 0 / NaN 视为无效：时长为 0 就是瞬切，正是本函数要避免的结果
    duration: Number.isFinite(duration) && duration > 0 ? duration : FALLBACK_DURATION,
    easing: easing.length > 0 ? easing : FALLBACK_EASING,
    easingOut: easingOut.length > 0 ? easingOut : FALLBACK_EASING_OUT
  }
}

/** 半档阶段时长（升遮罩 / 淡出）：0.5 × --dur-theme-reveal，取整毫秒。 */
function halfPhase(duration: number): number {
  return Math.max(1, Math.round(duration * HALF_PHASE_RATIO))
}

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function currentOpacity(element: Element): number {
  const value = Number.parseFloat(getComputedStyle(element).opacity)
  return Number.isFinite(value) ? value : 0
}

function ignore(animation: Animation): Promise<void> {
  return animation.finished.then(
    () => undefined,
    () => undefined
  )
}

/**
 * 播放 WAAPI 动画并登记。完成时 `commitStyles()` 固化末帧再 `cancel()`：
 * 快速连切取消动画时，元素不会跳回 CSS 基础态（如模糊层从 1 掉回 0）。
 */
function play(
  ctx: RevealContext,
  element: Element,
  keyframes: Keyframe[],
  duration: number,
  easing: string
): Animation {
  const animation = element.animate(keyframes, { duration, easing, fill: 'both' })
  ctx.animations.add(animation)
  void animation.finished
    .then(() => {
      try {
        animation.commitStyles()
      } catch {
        // commitStyles 在极少数元素 / 浏览器状态下会抛错；末帧视觉已由 fill 保持
      }
      animation.cancel()
      ctx.animations.delete(animation)
    })
    .catch(() => {
      ctx.animations.delete(animation)
    })
  return animation
}

/** 取消并固化上下文中的全部动画（供复用与销毁使用）。 */
function stopAnimations(ctx: RevealContext): void {
  for (const animation of [...ctx.animations]) {
    try {
      animation.commitStyles()
    } catch {
      // 已取消 / 尚未生效的动画没有可提交样式，忽略即可
    }
    animation.cancel()
  }
  ctx.animations.clear()
}

/** 用 Lucide `IconNode` 数据构造 SVG（覆盖层不走 React）。 */
function setBadgeIcon(container: HTMLElement, icon: IconNode): void {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.35')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')

  for (const [tag, attrs] of icon) {
    const node = document.createElementNS(SVG_NS, tag)
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined) node.setAttribute(key, String(value))
    }
    svg.appendChild(node)
  }

  container.replaceChildren(svg)
}

function createContext(): RevealContext {
  const root = document.createElement('div')
  root.className = 'wf-theme-reveal'
  root.setAttribute('aria-hidden', 'true')
  // 旧主题底色在建立瞬间固化：commit 后根上的 data-theme 会变，但 `__blur` /
  // `__veil` 的颜色不能跟着 var() 一起跳，否则「旧 → 新」的交叉会少一半。
  root.style.setProperty(TINT_VAR, readToken('--desk-solid') || 'transparent')

  const blur = document.createElement('div')
  blur.className = 'wf-theme-reveal__blur'
  const veil = document.createElement('div')
  veil.className = 'wf-theme-reveal__veil'
  const tint = document.createElement('div')
  tint.className = 'wf-theme-reveal__tint'
  const badge = document.createElement('div')
  badge.className = 'wf-theme-reveal__badge'
  const badgeInner = document.createElement('div')
  badgeInner.className = 'wf-theme-reveal__badge-inner'
  badge.appendChild(badgeInner)
  root.append(blur, veil, tint, badge)
  document.body.appendChild(root)

  const ctx: RevealContext = {
    root,
    blur,
    veil,
    tint,
    badge,
    badgeInner,
    animations: new Set(),
    phase: 'blurring',
    blurVisible: false,
    veilOpaque: false,
    keyBlock: null
  }

  // 动画期间持续拦截键盘，避免按键穿透到遮罩后的界面；遮罩移除时一并解除。
  // 正常 1.2s；`theme:apply` 超时兜底时最长约 4.2s（400 + 200 + 3000 + 400 + 200）。
  ctx.keyBlock = (event: KeyboardEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }
  window.addEventListener('keydown', ctx.keyBlock, true)

  return ctx
}

function destroyContext(): void {
  const ctx = activeContext
  if (!ctx) return
  activeContext = null
  stopAnimations(ctx)
  // 两层纯色归零后再移除：下一轮（尤其是新建覆盖层）不会看到上一轮的旧主题色
  ctx.veil.style.opacity = '0'
  ctx.tint.style.opacity = '0'
  ctx.veilOpaque = false
  if (ctx.keyBlock) window.removeEventListener('keydown', ctx.keyBlock, true)
  ctx.root.remove()
}

/**
 * 取得可复用的覆盖层：`fading` 阶段已接近不可见，直接销毁重建（重新模糊）；
 * 其余阶段复用并取消旧动画，保留模糊层。
 */
function acquireContext(): RevealContext {
  if (activeContext && activeContext.phase !== 'fading') {
    const ctx = activeContext
    stopAnimations(ctx)
    // 上一轮可能已经 commit：把旧主题基色对齐到当前 dataset，目标层与图标归零，
    // 避免复用遮罩时残留上一轮的新主题色 / 图标。
    ctx.root.style.setProperty(TINT_VAR, readToken('--desk-solid') || 'transparent')
    ctx.tint.style.opacity = '0'
    ctx.badge.style.opacity = '0'
    ctx.badgeInner.style.transform = 'scale(0.86)'
    ctx.phase = 'blurring'
    return ctx
  }

  destroyContext()
  const ctx = createContext()
  activeContext = ctx
  return ctx
}

/** 让模糊层可见；复用且已完成入场时直接返回。 */
async function ensureBlurVisible(
  ctx: RevealContext,
  motion: ReturnType<typeof readRevealMotion>,
  seq: number
): Promise<void> {
  if (ctx.blurVisible) return

  ctx.phase = 'blurring'
  const from = currentOpacity(ctx.blur)
  // 复用未完成的入场时按剩余比例缩短，避免快速连切把总时长越拖越长
  const remaining = Math.max(0, Math.round(motion.duration * (1 - from)))
  if (remaining === 0) {
    ctx.blurVisible = true
    return
  }

  const animation = play(
    ctx,
    ctx.blur,
    [{ opacity: from }, { opacity: 1 }],
    remaining,
    motion.easing
  )
  await ignore(animation)
  if (seq !== revealSequence) return
  ctx.blurVisible = true
}

/**
 * 把旧主题纯色遮罩提升到完全不透明：返回时 `__veil` 的 opacity 已固化到行内
 * 样式 1，调用方在它之后**不再有 await** 就直接发出 `theme:apply`。
 */
async function ensureVeilOpaque(
  ctx: RevealContext,
  motion: ReturnType<typeof readRevealMotion>,
  seq: number
): Promise<void> {
  if (ctx.veilOpaque) return

  ctx.phase = 'veiling'
  const full = halfPhase(motion.duration)
  const from = currentOpacity(ctx.veil)
  // 复用未完成的遮罩时按剩余比例缩短
  const remaining = Math.max(0, Math.round(full * (1 - from)))
  if (remaining === 0) {
    ctx.veil.style.opacity = '1'
    ctx.veilOpaque = true
    return
  }

  const animation = play(
    ctx,
    ctx.veil,
    [{ opacity: from }, { opacity: 1 }],
    remaining,
    motion.easing
  )
  await ignore(animation)
  if (seq !== revealSequence) return
  // 固化到行内样式，不依赖 fill / commitStyles 的执行顺序
  ctx.veil.style.opacity = '1'
  ctx.veilOpaque = true
}

/**
 * 解析目标主题；`theme:apply` 超过 `APPLY_TIMEOUT` 按 `fallback()` 收口。
 * 永不 reject：保证遮罩一定会继续走 commit → 交叉 → 淡出，不会停在纯色上。
 */
function resolveTarget(request: ThemeRevealRequest): Promise<ResolvedThemeId> {
  return new Promise((resolve) => {
    let settled = false
    let timer = 0
    const settle = (value: ResolvedThemeId): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      resolve(value)
    }
    timer = window.setTimeout(() => settle(request.fallback()), APPLY_TIMEOUT)

    try {
      request.resolve().then(
        (value) => settle(value),
        () => settle(request.fallback())
      )
    } catch {
      settle(request.fallback())
    }
  })
}

/** 无遮罩降级：解析完成后直接提交（仍受序号守卫）。 */
async function settleWithoutReveal(request: ThemeRevealRequest, seq: number): Promise<void> {
  const resolved = await resolveTarget(request)
  if (seq !== revealSequence) return
  request.commit(resolved)
}

async function orchestrate(
  ctx: RevealContext,
  request: ThemeRevealRequest,
  seq: number
): Promise<void> {
  const motion = readRevealMotion()
  let resolved: ResolvedThemeId | null = null

  try {
    // ① 模糊淡入：仍是半透明遮罩，用户能看到模糊后的界面。
    await ensureBlurVisible(ctx, motion, seq)
    if (seq !== revealSequence) return

    // ② 提升到完全不透明遮罩（旧主题纯色），此前不调用主进程。
    await ensureVeilOpaque(ctx, motion, seq)
    if (seq !== revealSequence) return

    // ③ 遮罩已完全不透明，且到 resolveTarget 之间没有 await：此刻切换原生材质，
    //    用户看不到 DWM 背板变化。超时按 fallback 提交，避免遮罩停在纯色上。
    const target = await resolveTarget(request)
    if (seq !== revealSequence) return
    resolved = target

    if (target === document.documentElement.dataset.theme) {
      // 解析结果与当前生效主题相同（典型：显式 dark → system，且系统正好是深色）：
      // 不播放空动画，只提交选中态。
      cancelThemeReveal()
      request.commit(target)
      return
    }

    // ④ 同一帧：dataset + React 状态 + 目标主题 tint + 图标。
    request.commit(target)
    ctx.phase = 'revealing'
    ctx.root.style.setProperty(TARGET_TINT_VAR, readToken('--desk-solid') || 'transparent')
    setBadgeIcon(ctx.badgeInner, THEME_ICONS[target])

    const tint = play(
      ctx,
      ctx.tint,
      [{ opacity: 0 }, { opacity: 1 }],
      motion.duration,
      motion.easing
    )
    const badge = play(
      ctx,
      ctx.badge,
      [{ opacity: 0 }, { opacity: 1 }],
      motion.duration,
      motion.easingOut
    )
    const badgeIn = play(
      ctx,
      ctx.badgeInner,
      [{ transform: 'scale(0.86)' }, { transform: 'scale(1)' }],
      motion.duration,
      motion.easingOut
    )
    await Promise.all([ignore(tint), ignore(badge), ignore(badgeIn)])
    if (seq !== revealSequence) return

    // ⑤ 淡出：整层透明度下降，图标同时轻微放大并淡出。
    ctx.phase = 'fading'
    const fadeDuration = halfPhase(motion.duration)
    const fade = play(ctx, ctx.root, [{ opacity: 1 }, { opacity: 0 }], fadeDuration, motion.easing)
    const badgeOut = play(
      ctx,
      ctx.badgeInner,
      [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }],
      fadeDuration,
      motion.easingOut
    )
    await Promise.all([ignore(fade), ignore(badgeOut)])
    if (seq !== revealSequence) return

    destroyContext()
  } catch {
    if (seq !== revealSequence) return
    // 动画异常：主题必须落地，遮罩必须移除。已解析则提交解析值，否则回退。
    request.commit(resolved ?? request.fallback())
    destroyContext()
  }
}

/**
 * 以全屏模糊覆盖层执行一次主题切换。
 *
 * `request.resolve` 在遮罩内调用（system 档会 await 主进程），`request.commit`
 * 必须在**同一同步段**内完成 `dataset.theme` 与 React 状态提交。
 */
export function runThemeReveal(request: ThemeRevealRequest): void {
  const seq = ++revealSequence

  // 降级 ①：减少动效；降级 ②：页面隐藏（此时原生背板与渲染层都不可见）
  if (prefersReducedMotion() || document.visibilityState === 'hidden') {
    destroyContext()
    void settleWithoutReveal(request, seq)
    return
  }

  let ctx: RevealContext
  try {
    ctx = acquireContext()
  } catch {
    // 降级 ③：覆盖层创建失败（body 尚未就绪 / DOM 异常）
    void settleWithoutReveal(request, seq)
    return
  }

  void orchestrate(ctx, request, seq)
}

/**
 * 立即取消进行中的覆盖层并移除。
 *
 * 用于「解析结果与当前主题相同」的快路径与 ThemeProvider 卸载：快路径不发生
 * 主题变化，不应留下任何遮罩；同时自增序号使在途解析结果失效。
 */
export function cancelThemeReveal(): void {
  revealSequence += 1
  destroyContext()
}
