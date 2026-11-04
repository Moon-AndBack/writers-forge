import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import '../../styles/components/editor-format.css'

/**
 * 编辑器通用**右键上下文菜单壳**（定位 / 夹取 / 关闭 / 选区保持）。
 *
 * 由 `TableContextMenu` 从零实现版本抽出（全仓此前无 contextmenu 基础设施），
 * 现作为唯一实现供各编辑器菜单复用（§9 不得出现平行实现）。壳只负责「在哪、怎么关」，
 * 「是否接管、菜单里放什么」由调用方通过 `shouldOpen` + `children` 提供。
 *
 * - **挂载**：监听 `editor.view.dom` 的 `contextmenu`（React 层接管，不改
 *   `useEditor` 的 `extensions` / `content` / `editorProps`——那是 W11 IME 修复的硬约束，
 *   菜单状态**不得**塞进 `editorProps` 闭包）；
 * - **拦截条件**：壳恒要求编辑器可编辑（只读态永不弹菜单），且调用方 `shouldOpen`
 *   返回 true 时才 `preventDefault()` + 开菜单；否则不拦截，浏览器默认菜单照常；
 * - **选区保持**：ProseMirror 的 `contextmenu` 处理器只 `forceDOMFlush`，不改选区；
 *   本组件全程不聚焦 DOM，菜单内按钮 `onMouseDown` 阻止默认（见 FormatButton），
 *   故右键前的光标 / 单元格选区在命令执行时仍然有效；
 * - **定位**：`createPortal` 到 `document.body` + `position: fixed` 取鼠标坐标，
 *   夹取回视口内（标题栏 `overflow: hidden` 也裁不到 body 层节点）。菜单尺寸随内容
 *   变化，故先用原始锚点渲染、再于 `useLayoutEffect` 内按实测宽（未传 `width` 时）
 *   与实测高夹取，并由 ResizeObserver 跟随内容变化重夹（不在渲染期读 ref）；
 * - **关闭**：Esc / 指针按下落在菜单外 / 滚动 / 窗口尺寸变化 / 窗口失焦。
 */
export interface EditorContextMenuProps {
  /** Tiptap 编辑器实例；null 时不挂监听。 */
  editor: Editor | null
  /** 是否由本菜单接管本次右键；返回 false 时浏览器默认菜单照常。 */
  shouldOpen: (editor: Editor) => boolean
  /** 无障碍标签（`role="menu"` 的 `aria-label`）。 */
  ariaLabel: string
  /** 可选面板标题；省略时不渲染标题行。 */
  title?: string
  /**
   * 可选面板固定宽度（px）；**省略时宽度由内容决定**（`max-content`，按最长菜单项撑开）。
   * 横向夹取一律按实测宽（`offsetWidth`）计算，与此值无关。
   */
  width?: number
  /** 附加类名（如 `wf-tablemenu` 的紧凑内边距）。 */
  className?: string
  /** 菜单内容；参数 `close` 供点选后收起自身。 */
  children: (close: () => void) => ReactNode
}

/** 菜单与鼠标点的间距（px）。 */
const OFFSET = 2
/** 视口边缘留白（px）。 */
const PAD = 8
/**
 * 表格右键菜单的固定宽度（px；沿用 B1 既有外观，保证按钮文字不折行）。
 * 正文选区菜单已改为内容自适应，故本常量仅供需要固定宽的调用方显式传入。
 */
export const DEFAULT_MENU_WIDTH = 248

interface MenuPosition {
  left: number
  top: number
}

/** 把锚点夹取回视口内（横向按实测宽、纵向按实测高）。 */
function clampPosition(anchor: MenuPosition, height: number, width: number): MenuPosition {
  return {
    left: Math.min(anchor.left, Math.max(PAD, window.innerWidth - width - PAD)),
    top: Math.min(anchor.top, Math.max(PAD, window.innerHeight - height - PAD))
  }
}

export function EditorContextMenu({
  editor,
  shouldOpen,
  ariaLabel,
  title,
  width,
  className,
  children
}: EditorContextMenuProps): ReactNode {
  /** 原始锚点（鼠标坐标）；null = 菜单关闭。 */
  const [anchor, setAnchor] = useState<MenuPosition | null>(null)
  /** 夹取后的最终位置（渲染用；由布局副作用按实测宽 / 高回填）。 */
  const [pos, setPos] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  /**
   * `shouldOpen` 通常是调用方的行内箭头函数（每次渲染新引用）。
   * 经 ref 取最新值，监听 effect 只依赖 `editor`，避免每次父组件重渲染都重挂监听。
   */
  const shouldOpenRef = useRef(shouldOpen)
  useEffect(() => {
    shouldOpenRef.current = shouldOpen
  }, [shouldOpen])

  const close = useCallback((): void => {
    setAnchor(null)
    setPos(null)
  }, [])

  // 监听编辑器容器的 contextmenu：可编辑 + 调用方谓词通过时才接管。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined
    const dom = editor.view.dom
    const onContextMenu = (event: globalThis.MouseEvent): void => {
      if (editor.isDestroyed || !editor.isEditable) return
      if (!shouldOpenRef.current(editor)) return
      event.preventDefault()
      setAnchor({ left: event.clientX + OFFSET, top: event.clientY + OFFSET })
    }
    dom.addEventListener('contextmenu', onContextMenu)
    return () => {
      dom.removeEventListener('contextmenu', onContextMenu)
    }
  }, [editor])

  // 锚点变化后按菜单**实测**尺寸夹取（绘制前完成，不闪跳）。
  //
  // 宽度：传了 `width` 用它，否则用内容撑开后的实测宽（`offsetWidth`，首帧布局已完成即可读到，
  // 不会出现按 0 夹取）。内容变化（如选区菜单展开类别面板、切换语言）会改变实测宽 / 高，
  // 故再用 ResizeObserver 重夹一次，保证菜单始终留在视口内且位置只动一次。
  useLayoutEffect(() => {
    if (anchor === null) return undefined
    const node = menuRef.current
    if (node === null) return undefined
    const place = (): void => {
      const next = clampPosition(anchor, node.offsetHeight, width ?? node.offsetWidth)
      // 位置未变时复用旧对象：避免 ResizeObserver 初始回调引发多余渲染。
      setPos((prev) =>
        prev !== null && prev.left === next.left && prev.top === next.top ? prev : next
      )
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(node)
    return () => observer.disconnect()
  }, [anchor, width])

  // 展开期间：Esc / 菜单外指针按下 / 滚动 / 尺寸变化 / 窗口失焦 → 关闭。
  useEffect(() => {
    if (anchor === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (menuRef.current?.contains(target)) return
      close()
    }
    const onScroll = (): void => close()
    const onBlur = (): void => close()
    // 捕获阶段：菜单挂 body，滚动多发生在编辑器滚动容器内。
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('blur', onBlur)
    }
  }, [anchor, close])

  if (anchor === null || typeof document === 'undefined') return null

  // 首帧用原始锚点（pos 尚未回填），夹取在 useLayoutEffect 内随即修正。
  const placed = pos ?? anchor

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      // `is-placed`：起飞条件与 FormatPopover 共用（进场动画只在 .is-placed 下声明）。
      // 本菜单首帧即可见（`placed = pos ?? anchor`，不经 visibility: hidden），
      // 故恒定挂上——否则改 CSS 后会失去进场动画。
      className={`wf-format-pop${className ? ` ${className}` : ''} is-placed`}
      // 宽度：显式 `width` 为固定像素，省略时交给内容（`max-content`，按最长菜单项撑开）。
      style={{
        width: width !== undefined ? `${width}px` : 'max-content',
        left: `${placed.left}px`,
        top: `${placed.top}px`
      }}
      // 菜单内任意位置按下都不夺焦（按钮自身已在 FormatButton 内阻止默认）。
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {title !== undefined && <div className="wf-format-pop__title">{title}</div>}
      {children(close)}
    </div>,
    document.body
  )
}

export default EditorContextMenu
