import { useEffect, useId, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Window } from './Window'
import type { WindowSize } from './Window'
import '../../styles/components/surface.css'

/** 弹窗面板尺寸，与窗口框架 `Window` 的宽度档位一致。 */
export type ModalSize = WindowSize

/* ---------- 模块级弹窗栈 ----------
   不进 context：Modal 的调用点遍布路由 / 页面 / 浮层，逐层补 Provider 侵入过大。
   栈按「打开顺序」记录实例 id 与其遮罩模式，用于三件事：Esc 只由栈顶响应、
   Tab trap 只由栈顶启用、背景 inert 的作用范围由栈顶的遮罩模式决定。 */
interface OpenModalEntry {
  id: string
  /** 该弹窗的遮罩是否覆盖标题栏；决定背景 inert 的作用范围。 */
  coverTitlebar: boolean
}

const openModalStack: OpenModalEntry[] = []

/** 可聚焦元素标准集合（口径同 WAI-ARIA APG 的 dialog 实践）。 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  "input:not([disabled]):not([type='hidden'])",
  'select:not([disabled])',
  'textarea:not([disabled])',
  "[tabindex]:not([tabindex='-1'])"
].join(',')

/* ---------- 退场动画（延后卸载） ----------
   关闭不再瞬间卸载：`open` 变 false 的那次提交仍把面板留在 DOM 里并挂 `is-closing`，
   由 `surface.css` 播放一个 --dur-slow 的退场动画，到期才真正卸载。
   关键约束：弹窗栈 / 背景 inert / body 滚动锁仍由下方主 effect 的 cleanup 在
   **同一提交内**撤销，不等动画结束 —— 视觉上还在淡出，逻辑上已经「关闭」，
   背景不会因为退场而多锁一个动画时长。 */
const EXIT_FALLBACK_MS = 240 // 与 theme.css 的 --dur-slow 一致，仅在令牌读不到时兜底

/** 退场时长：优先取 :root 的 --dur-slow；系统开启「减少动态效果」时返回 0（不播放）。 */
function resolveExitDuration(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--dur-slow')
    .trim()
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return EXIT_FALLBACK_MS
  // 令牌以 ms 书写（--dur-slow: 240ms）；顺带兼容 s 的写法。
  return raw.endsWith('ms') ? value : value * 1000
}

/**
 * 弹窗打开期间给背景加 inert：不可聚焦、不可点击。范围由**栈顶**弹窗的遮罩模式决定。
 *
 * - 栈顶 `coverTitlebar`（默认，全屏遮罩）：inert 施加到 `#root`，标题栏 / 状态栏 /
 *   内容区一并不可交互。点击落在遮罩（由 body 下的 portal 承载）上，不会穿透到标题栏。
 * - 栈顶 `coverTitlebar === false`（遮罩避开标题栏，如设置弹窗）：inert 收窄到内容区
 *   `main.app-viewport`（标题栏 / 状态栏是它的兄弟节点），标题栏保持可交互，供触发
 *   按钮（齿轮 ×）自行关闭弹窗；键盘 Tab 仍被 `trapTabKey` 拦在面板内，不会逃到标题栏。
 *
 * 嵌套语义以最上层为准：设置弹窗（`false`）上再开确认框（`true`）时栈顶是确认框，
 * 标题栏被阻塞（确认框本应全屏）；确认框关闭后栈顶回到设置弹窗，标题栏恢复可点；
 * 栈空则两处都不留 inert。
 *
 * 每次同步先清除两处可能残留的 inert 再重新施加，防止模式切换（全屏 ↔ 避标题栏）
 * 时属性叠加在另一个元素上。`#root` 被设 inert 时其内部的内容区同样失效，因此无需
 * 两处同时设置。Modal 经 portal 挂到 body，位于两者之外，不受该属性影响。
 */
function syncBackgroundInert(): void {
  if (typeof document === 'undefined') return
  const root = document.getElementById('root')
  const viewport = document.querySelector('main.app-viewport')
  const top = openModalStack[openModalStack.length - 1]
  // 先清除两处可能残留的 inert，再按当前栈顶重新施加（避免模式切换时叠加）。
  root?.removeAttribute('inert')
  viewport?.removeAttribute('inert')
  if (!top) return
  const target = top.coverTitlebar ? (root ?? viewport) : (viewport ?? root)
  target?.setAttribute('inert', '')
}

function pushModal(entry: OpenModalEntry): void {
  const index = openModalStack.findIndex((item) => item.id === entry.id)
  if (index !== -1) openModalStack.splice(index, 1)
  openModalStack.push(entry)
  syncBackgroundInert()
}

function removeModal(id: string): void {
  const index = openModalStack.findIndex((item) => item.id === id)
  if (index === -1) return
  openModalStack.splice(index, 1)
  syncBackgroundInert()
}

function isTopModal(id: string): boolean {
  return openModalStack[openModalStack.length - 1]?.id === id
}

/** 取面板内当前可见的可聚焦元素（返回顺序即 DOM / tab 顺序）。 */
function getFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null && element.getClientRects().length > 0
  )
}

/** Tab / Shift+Tab 在面板内首尾循环；无可用焦点时落回面板本身。 */
function trapTabKey(event: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return

  const focusables = getFocusableElements(panel)
  if (focusables.length === 0) {
    event.preventDefault()
    panel.focus()
    return
  }

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement
  const insidePanel = active instanceof HTMLElement && panel.contains(active)

  if (active === panel) {
    // 焦点在面板本身（初始聚焦态）：Tab 进首元素，Shift+Tab 进尾元素。
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target.focus()
    return
  }

  if (event.shiftKey) {
    if (!insidePanel || active === first) {
      event.preventDefault()
      last.focus()
    }
    return
  }

  if (!insidePanel || active === last) {
    event.preventDefault()
    first.focus()
  }
}

export interface ModalProps {
  /** 是否显示 */
  open: boolean
  /** 关闭回调（遮罩 / Esc / 关闭按钮触发） */
  onClose: () => void
  /** 标题，提供后渲染头部 */
  title?: ReactNode
  /** 底部内容 */
  footer?: ReactNode
  /** 面板宽度，默认 md */
  size?: ModalSize
  /** 点击遮罩是否关闭，默认 true */
  closeOnMask?: boolean
  /** 按 Esc 是否关闭，默认 true */
  closeOnEsc?: boolean
  /** 是否显示右上角关闭按钮，默认 true */
  showClose?: boolean
  /** 关闭按钮的无障碍标签，缺省用 common.close */
  closeLabel?: string
  /** 对话框无障碍名称（无可见标题时使用） */
  ariaLabel?: string
  /** 透传到面板的 className */
  panelClassName?: string
  /** 遮罩附加类名：用于按场景加强模糊 / 调整遮罩（默认沿用 blur(2px)）。 */
  maskClassName?: string
  /**
   * 遮罩是否覆盖标题栏（默认 true，全屏）。
   * false 时遮罩从标题栏下沿开始，标题栏保持可交互（供触发按钮自己关闭弹窗，
   * 如设置弹窗的齿轮 ×）。此时背景 inert 目标同步收窄到内容区。
   */
  coverTitlebar?: boolean
  children?: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  footer,
  size = 'md',
  closeOnMask = true,
  closeOnEsc = true,
  showClose = true,
  closeLabel,
  ariaLabel,
  panelClassName,
  maskClassName,
  coverTitlebar = true,
  children
}: ModalProps) {
  const { t } = useTranslation('common')
  const panelRef = useRef<HTMLDivElement>(null)
  // useId 在 StrictMode 的重复挂载下仍稳定，适合作为栈标识。
  const instanceId = useId()
  const onCloseRef = useRef(onClose)
  const closeOnEscRef = useRef(closeOnEsc)

  /* ---------- 退场状态（视觉延后，逻辑即时） ---------- */
  /** 退场中：`open` 已为 false，面板仍在 DOM 里播完退场动画。 */
  const [exiting, setExiting] = useState(false)
  /** 上一次提交的 `open`：在渲染期识别 true → false / false → true 的切换。 */
  const [prevOpen, setPrevOpen] = useState(open)
  /** 最近一次「打开态」的内容快照：退场期间父组件通常已把数据置空
      （如 useConfirm 关闭时把 pending 置 null），若照常渲染，面板会在淡出的
      一个 --dur-slow 里先塌成空壳。故退场时改用快照渲染，画面保持关闭那一刻的样子。 */
  const [snapshot, setSnapshot] = useState<{
    title?: ReactNode
    footer?: ReactNode
    children?: ReactNode
  }>({ title, footer, children })

  // 渲染期同步（React 官方「props 变化时调整 state」模式：同一提交内完成，不闪空壳）：
  //   true → false：立即进入退场态（本次渲染就带 is-closing，动画从当前姿态起）；
  //   false → true：立即退出退场态（重开不残留 is-closing，也无须等计时器）。
  if (prevOpen !== open) {
    setPrevOpen(open)
    setExiting(!open)
  }

  // 打开态持续刷新内容快照；退场态不刷新，从而冻结在最后一次打开时的内容。
  if (
    open &&
    (snapshot.title !== title || snapshot.footer !== footer || snapshot.children !== children)
  ) {
    setSnapshot({ title, footer, children })
  }

  // 退场计时：到期才真正卸载。计时器随 open 重开、依赖变化、组件卸载被 cleanup 清掉，
  // 快速开关不会留下并发计时器（每次切换都是「先清旧的、再起新的」）。
  useEffect(() => {
    if (open || !exiting) return undefined
    const timer = window.setTimeout(() => setExiting(false), resolveExitDuration())
    return () => window.clearTimeout(timer)
  }, [open, exiting])

  // 回调每次渲染后同步到 ref：主 effect 不依赖 onClose / closeOnEsc，避免内联回调
  // 变更导致反复出栈 / 入栈而打乱栈序（后打开者必须始终保持栈顶）。
  useEffect(() => {
    onCloseRef.current = onClose
    closeOnEscRef.current = closeOnEsc
  })

  // 主 effect 依赖 `coverTitlebar`：该 prop 在各调用点都是静态的；真变化时重新登记
  // 一次，保证栈内遮罩模式与背景 inert 范围同步（否则会沿用旧的登记值）。
  useEffect(() => {
    if (!open) return

    pushModal({ id: instanceId, coverTitlebar })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      // 非栈顶（被上层弹窗覆盖）一律忽略：嵌套时一次 Esc 只关一层。
      if (!isTopModal(instanceId)) return

      if (event.key === 'Escape') {
        if (closeOnEscRef.current) onCloseRef.current()
        return
      }

      if (event.key === 'Tab') trapTabKey(event, panelRef.current)
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      removeModal(instanceId)
    }
  }, [open, instanceId, coverTitlebar])

  if ((!open && !exiting) || typeof document === 'undefined') return null

  // 退场期间改用快照内容渲染（见上文 snapshot 说明）；打开态始终用实时 props。
  const viewTitle = open ? title : snapshot.title
  const viewFooter = open ? footer : snapshot.footer
  const viewChildren = open ? children : snapshot.children

  const handleMaskClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnMask && event.target === event.currentTarget) onClose()
  }

  const hasHead = viewTitle !== undefined || showClose
  const closingClass = exiting ? 'is-closing' : ''
  const windowClasses = ['wf-modal__panel', panelClassName ?? '', closingClass]
    .filter(Boolean)
    .join(' ')
  const maskClasses = ['wf-modal__mask', maskClassName ?? '', closingClass]
    .filter(Boolean)
    .join(' ')
  // 容器类：`coverTitlebar={false}` 时加修饰类，把遮罩起点压到标题栏下沿。
  const modalClasses = ['wf-modal', coverTitlebar ? '' : 'wf-modal--no-titlebar', closingClass]
    .filter(Boolean)
    .join(' ')

  return createPortal(
    // 退场期间对容器加 `inert`：弹窗逻辑上已关闭，面板立即脱离焦点顺序与无障碍树
    // （焦点会在同一提交内落回 body，与改动前「关闭即卸载」的焦点时机一致）；
    // 同时免去遮罩在退场中截获点击。视觉动画不受影响。
    <div className={modalClasses} inert={exiting}>
      <div className={maskClasses} onClick={handleMaskClick} />
      <Window
        ref={panelRef}
        className={windowClasses}
        title={hasHead ? viewTitle : undefined}
        onClose={hasHead && showClose ? onClose : undefined}
        showClose={showClose}
        closeLabel={closeLabel ?? t('close')}
        footer={viewFooter}
        size={size}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        {viewChildren}
      </Window>
    </div>,
    document.body
  )
}

Modal.displayName = 'Modal'

export default Modal
