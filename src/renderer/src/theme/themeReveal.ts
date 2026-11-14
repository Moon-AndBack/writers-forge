/**
 * 主题切换的**整屏交叉淡化**（View Transitions API）。
 *
 * 交互按窗口材质分两种：
 * - **不透明模式**（`data-material='none'`）：「覆盖式」淡化——旧快照保持不透明
 *   垫底（`::view-transition-old(root)` 的 UA 淡出已在
 *   `styles/components/motion.css` 关闭），新快照在它之上从 0 → 1 淡入。
 *   因此任何中间帧都是一次不透明混合，不会出现两层同时半透明导致的
 *   「透底泛灰」（亮 / 暗主题明度差极大，真交叉会闪灰）。
 * - **窗口材质模式**（`data-material` 为 `'acrylic'` / `'mica'`）：真交叉 + `plus-lighter`
 *   ——此时窗口底是 `.shell` 的 50% 不透明底（`--desk-solid-alpha`）配 body 透明，
 *   覆盖式淡化会让两层快照的 alpha 相加（0.50 → 0.75），表现为过渡期间越来越实、
 *   快照撤掉后又跳回通透。故 new 淡入的同时 old 同步淡出，两层以
 *   `mix-blend-mode: plus-lighter` 按 a·(1-t) / a·t 预乘相加，合计恒为 a = 0.50，
 *   材质参与度全程不变（CSS 侧见 `motion.css` 的窗口材质规则）。
 *
 * 为何由 JS（WAAPI）而不是 CSS 承担动画：
 * - `document.startViewTransition` 只能由 JS 启动，整窗快照也只有它能拍摄；
 * - 曾经由 CSS `animation` + 180ms 的短时长 + `--ease-out` 驱动，
 *   但这条强前倾曲线在 36ms 时 y≈0.74、61ms 时 y≈0.875，前 3 帧就走完
 *   3/4 的透明度，有效可感知时长仅 50–60ms，肉眼等同瞬切；
 * - WAAPI 还免疫 CSS 的 `!important` 兜底与伪元素上 `var()` 继承问题。
 * 现在时长 / 缓动统一在此读取主题令牌（`--dur-slow` / `--ease`），
 * 曲线改为对称的 `--ease`，让淡化完整跑满 240ms。
 *
 * 边界（硬要求）——任何一条都**同步**调用 `applyTheme`，主题切换永不依赖动画：
 * - 浏览器不支持 `document.startViewTransition` → 直接切换；
 * - 系统开启「减少动态效果」→ 直接切换；
 * - 启动过渡时抛错 → 直接切换；
 * - 过渡被浏览器跳过（`ready` reject）→ `updateCallback` 可能未执行（规范：
 *   `pending-capture` 阶段跳过会直接 reject、回调永不触发），故在 catch 中补调
 *   一次幂等的 `applyTheme`，并以切换序号守卫避免与后续切换竞争。
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** 窗口材质（亚克力 / 云母）在根元素上的标记值，与 `styles/material.css` 的选择器一致。 */
const MATERIAL_MARKERS = new Set(['acrylic', 'mica'])

/** 与 `theme.css` 的 `--dur-slow` 对齐；令牌读取失败时的回退值（毫秒）。 */
const FALLBACK_DURATION = 240
/** 与 `theme.css` 的 `--ease` 对齐（对称曲线）；令牌读取失败时的回退值。 */
const FALLBACK_EASING = 'cubic-bezier(0.33, 0, 0.67, 1)'

/**
 * 切换序号：每次 `runThemeReveal` 自增。
 *
 * 仅用于 `transition.ready` 被 reject 时的兜底判断：只有「自己仍是最新一次切换」
 * 才补调 `applyTheme`，避免前一次被跳过时把已被取代的目标主题回写到 DOM。
 */
let revealSequence = 0

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

/**
 * 当前是否处于窗口材质模式（亚克力 / 云母）。
 *
 * 读 `WindowMaterialProvider` 投影到根元素的 `data-material`：值为 `'acrylic'` /
 * `'mica'` 时 `.shell` 才是 50% 不透明底、body 才透明（见 `material.css`），
 * 也只有此时需要 `plus-lighter` 真交叉。属性缺失 / `'none'` 一律按不透明模式
 * 处理（保持原覆盖式淡化）。
 */
function hasWindowMaterial(): boolean {
  return MATERIAL_MARKERS.has(document.documentElement.dataset.material ?? '')
}

/**
 * 读取本次淡化使用的时长 / 缓动。
 *
 * 读令牌而非写字面量：`theme.css` 约定「动效时长梯度统一取用，禁止再写裸时长」，
 * 读令牌可保持「改令牌即全局生效」；令牌缺失 / 解析失败（如样式尚未加载、
 * 值被写成非法形式）时回退到与当前令牌一致的常量，保证动画照常可见。
 */
function readRevealMotion(): { duration: number; easing: string } {
  const styles = getComputedStyle(document.documentElement)
  const duration = Number.parseFloat(styles.getPropertyValue('--dur-slow'))
  const easing = styles.getPropertyValue('--ease').trim()

  return {
    // 0 / NaN 视为无效：时长为 0 就是瞬切，正是本函数要避免的结果
    duration: Number.isFinite(duration) && duration > 0 ? duration : FALLBACK_DURATION,
    easing: easing.length > 0 ? easing : FALLBACK_EASING
  }
}

/**
 * 以整屏交叉淡化执行一次主题切换。
 *
 * `applyTheme` 必须在**同步**执行时完成全部 DOM 变更（`dataset.theme` 与
 * React 状态提交），否则 View Transition 会在变更落地前拍下新快照。
 */
export function runThemeReveal(applyTheme: () => void): void {
  // 降级 ①：环境不支持 View Transitions；降级 ②：系统要求减少动态效果
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    applyTheme()
    return
  }

  const sequence = ++revealSequence

  try {
    // 令牌提前读取：`getComputedStyle` 会强制一次同步样式计算。若放在
    // `transition.ready` 的 `.then()` 里，会在「快照已捕获 → WAAPI 动画生效」
    // 这段关键窗口上额外增加延迟，多送出一帧（新快照起始态的 CSS opacity 已为 0，
    // 不会闪，但会拖慢淡化起手）。此处读到一次即可，供下面的回调复用。
    const { duration, easing } = readRevealMotion()

    const transition = document.startViewTransition(() => {
      // 回调必须同步返回，DOM 变更在回调内完成
      applyTheme()
    })

    // 快照透明度由 WAAPI 驱动（CSS 侧只保留 animation: none、new 的起始态与混合模式）
    transition.ready
      .then(() => {
        // `pseudoElement` 尚未进入 lib.dom 的 KeyframeAnimationOptions 类型，
        // 用交叉类型补上；运行时是合法的 WAAPI 选项。
        const newOptions: KeyframeAnimationOptions & { pseudoElement: string } = {
          duration,
          easing,
          // `fill: 'both'` —— 因为 CSS 基础 opacity 已是 0，动画必须用 forwards fill
          // 保持末帧 1，否则动画结束后回落 0 会导致末帧跳变；
          // backwards fill 也保证（若将来加 delay）延迟期仍是 0。
          fill: 'both',
          pseudoElement: '::view-transition-new(root)'
        }
        // 两种材质都由 new 从 0 → 1 浮上来
        document.documentElement.animate([{ opacity: 0 }, { opacity: 1 }], newOptions)

        if (hasWindowMaterial()) {
          // 窗口材质模式：old 同步淡出。与 new 一起在 `mix-blend-mode: plus-lighter`
          // 下按 a·(1-t) / a·t 预乘相加，合计恒为 a = 0.50（见 motion.css），
          // 避免覆盖式叠加把 alpha 抬到 0.75 → 过渡中越来越实、结束后跳回通透。
          //
          // `fill: 'forwards'`：动画结束后 old 必须保持 opacity 0 直到快照被移除。
          // 缺省 `fill: none` 会让它回落到基础值 1，与 new 相加后 alpha 超过 1
          //（被钳制），出现一帧整窗变实。
          const oldOptions: KeyframeAnimationOptions & { pseudoElement: string } = {
            duration,
            easing,
            fill: 'forwards',
            pseudoElement: '::view-transition-old(root)'
          }
          document.documentElement.animate([{ opacity: 1 }, { opacity: 0 }], oldOptions)
        }
      })
      .catch((error: unknown) => {
        // 过渡被浏览器跳过（窗口隐藏 / 连续切主题等）。
        // 规范里 `skip the view transition` 在 `pending-capture` / `capturing-old`
        // 阶段会直接 reject ready 并返回，`updateCallback` **不会执行**，即
        // `applyTheme` 可能尚未落地；而 new 因 CSS 基础 opacity 为 0 全程不可见，
        // 不补调就会「主题没切」。「瞬切但不闪」优于「没反应」，故此处补调（幂等）。
        //
        // 序号守卫：仅当自己仍是最新一次切换时才补调。连续快速切主题时，前一次被
        // 后一次跳过，若前一次也回写自己的目标主题，会先跳回旧目标再被后一次覆盖
        //（旧快照拍到的就是错误画面）；此时后一次的 `applyTheme` 必然落地，无需插手。
        console.warn('[theme] view transition skipped', error)
        if (sequence === revealSequence) applyTheme()
      })

    // `ready` reject 时 `finished` 同样会 reject；此处再兜一层，避免 unhandled rejection
    void transition.finished.catch(() => {})
  } catch {
    // 降级 ③：启动失败时回调通常尚未执行；重复调用 applyTheme 是幂等的
    //（同一 state / dataset 值），保证主题一定切过去
    applyTheme()
  }
}
