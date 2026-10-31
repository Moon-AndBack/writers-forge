import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { useTranslation } from 'react-i18next'
import { TableMenuContent } from './TableMenuContent'
import '../../styles/components/editor-format.css'

/**
 * 大纲编辑区表格**右键上下文菜单**（B1）。
 *
 * 从零实现（全仓此前无 contextmenu 基础设施）：
 * - **挂载**：监听 `editor.view.dom` 的 `contextmenu`（React 层接管，不改
 *   `OutlineEditor` 的 `EDITOR_PROPS` 模块级恒等常量——那是 W11 IME 修复的硬约束）；
 * - **拦截条件**：仅 `editor.isActive('table')` 时 `preventDefault()` + 开菜单，
 *   否则不拦截，浏览器默认菜单照常（在表格外右键不受影响）；
 * - **选区保持**：ProseMirror 的 `contextmenu` 处理器只 `forceDOMFlush`，不改选区；
 *   本组件全程不聚焦 DOM，菜单内按钮 `onMouseDown` 阻止默认（见 FormatButton），
 *   故右键前的光标 / 单元格选区在命令执行时仍然有效；
 * - **定位**：`createPortal` 到 `document.body` + `position: fixed` 取鼠标坐标，
 *   夹取回视口内（标题栏 `overflow: hidden` 也裁不到 body 层节点）。菜单高度随内容
 *   变化，故先用原始锚点渲染、再于 `useLayoutEffect` 内按实测高度夹取（不在渲染期读 ref）；
 * - **关闭**：Esc / 指针按下落在菜单外 / 滚动 / 窗口尺寸变化 / 窗口失焦。
 */
export interface TableContextMenuProps {
  /** Tiptap 编辑器实例；null 时不挂监听。 */
  editor: Editor | null
}

/** 菜单与鼠标点的间距（px）。 */
const OFFSET = 2
/** 视口边缘留白（px）。 */
const PAD = 8
/** 菜单宽度（px；与面板宽度一致，保证按钮文字不折行）。 */
const MENU_WIDTH = 248

interface MenuPosition {
  left: number
  top: number
}

/** 把锚点夹取回视口内（横向按固定宽、纵向按实测高）。 */
function clampPosition(anchor: MenuPosition, height: number): MenuPosition {
  return {
    left: Math.min(anchor.left, Math.max(PAD, window.innerWidth - MENU_WIDTH - PAD)),
    top: Math.min(anchor.top, Math.max(PAD, window.innerHeight - height - PAD))
  }
}

export function TableContextMenu({ editor }: TableContextMenuProps): ReactNode {
  const { t } = useTranslation('common')
  /** 原始锚点（鼠标坐标）；null = 菜单关闭。 */
  const [anchor, setAnchor] = useState<MenuPosition | null>(null)
  /** 夹取后的最终位置（渲染用；由布局副作用按实测高度回填）。 */
  const [pos, setPos] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback((): void => {
    setAnchor(null)
    setPos(null)
  }, [])

  // 监听编辑器容器的 contextmenu：仅表格内拦截。
  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined
    const dom = editor.view.dom
    const onContextMenu = (event: globalThis.MouseEvent): void => {
      if (!editor.isEditable || !editor.isActive('table')) return
      event.preventDefault()
      setAnchor({ left: event.clientX + OFFSET, top: event.clientY + OFFSET })
    }
    dom.addEventListener('contextmenu', onContextMenu)
    return () => {
      dom.removeEventListener('contextmenu', onContextMenu)
    }
  }, [editor])

  // 锚点变化后按菜单实测高度夹取（绘制前完成，不闪跳）。
  useLayoutEffect(() => {
    if (anchor === null) return
    setPos(clampPosition(anchor, menuRef.current?.offsetHeight ?? 0))
  }, [anchor])

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
      aria-label={t('format.tableMenu')}
      // `is-placed`：起飞条件与 FormatPopover 共用（进场动画只在 .is-placed 下声明）。
      // 本菜单首帧即可见（`placed = pos ?? anchor`，不经 visibility: hidden），
      // 故恒定挂上——否则改 CSS 后会失去进场动画。
      className="wf-format-pop wf-tablemenu is-placed"
      style={{ width: `${MENU_WIDTH}px`, left: `${placed.left}px`, top: `${placed.top}px` }}
      // 菜单内任意位置按下都不夺焦（按钮自身已在 FormatButton 内阻止默认）。
      onMouseDown={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="wf-format-pop__title">{t('format.tableMenu')}</div>
      <TableMenuContent editor={editor} onDone={close} />
    </div>,
    document.body
  )
}

export default TableContextMenu
