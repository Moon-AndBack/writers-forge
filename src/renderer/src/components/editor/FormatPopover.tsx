import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/core'
import { IconButton } from '../ui'
import '../../styles/components/editor-format.css'

/**
 * 编辑器格式「图标触发 + 浮层面板」通用组件（大纲页标题栏格式分组复用）。
 *
 * 为何必须 portal 到 `document.body`：
 * 标题栏按钮容器 `.tb-module-actions` 与外壳 `.shell` / `.app-viewport` 都是
 * `overflow: hidden`（见 titlebar.css / shell.css），就地 `position: absolute`
 * 展开的下拉面板会被上层裁掉（面板一展开即在标题栏下方被裁）。故面板经
 * `createPortal` 挂到 `document.body`，用 `position: fixed` + 触发器矩形定位，
 * 与 `components/ui/Tooltip.tsx` 的逃逸做法一致。
 *
 * `-webkit-app-region`：`.titlebar` 整条是 `drag`，portal 出去的面板虽已脱离标题栏
 * DOM，但其上方仍是窗口拖拽区语义——面板自带 `no-drag`（同 theme-switcher.css），
 * 否则面板内按钮点不动。
 *
 * 选区保持：触发器与面板内所有按钮均 `onMouseDown` 阻止默认（`preventDefault`），
 * 点击时编辑器选区 / 焦点不被 DOM 焦点转移冲掉——这是「选中文字后点格式按钮生效」
 * 的前提（与 `EditorFormatGroup` 同口径）。命令链一律在 `onClick` 回调内现建。
 *
 * 关闭：Esc、指针按下落在触发器 + 面板之外、`close()`（面板内选择项的收尾）。
 *
 * 层级：面板 `z-index: 940`（见 editor-format.css）——低于自绘 tooltip（990），
 * 故触发器 / 面板内 tooltip 不会被面板自身遮挡。
 */
export interface FormatPopoverProps {
  /** Tiptap 编辑器实例；null 时触发器禁用（面板不展开）。 */
  editor: Editor | null
  /** 触发器无障碍标签 / tooltip 文案（已翻译）。 */
  label: string
  /** 触发器图标。 */
  icon: ReactNode
  /** 面板无障碍名称（已翻译）。 */
  panelLabel: string
  /** 触发器是否呈激活态（如光标在表格内）。 */
  triggerActive?: boolean
  /**
   * 触发器图标下方的色值指示条（供高亮 / 字色按钮展示当前值）；缺省不渲染。
   * 传 CSS 颜色字符串（如 `#fbdede`）。
   */
  indicatorColor?: string
  /** 触发器是否禁用（如不在表格内时表格分组不可用）。 */
  disabled?: boolean
  /**
   * 禁用原因（已翻译）。提供时触发器**不挂原生 `disabled`**，改挂 `aria-disabled`
   * 并以此文案作 tooltip / `title` —— 原生 disabled 元素**不派发鼠标事件**，
   * tooltip 无从显示；该形态既置灰（`icon-button.css` 的 `[aria-disabled='true']`
   * 透明度 + `not-allowed`）又可 hover / focus 出「为何不可用」。
   */
  disabledReason?: string
  /** 面板宽度（px），默认 236。 */
  width?: number
  /** 面板内容；渲染函数形式可拿到 `close` 以在选择后收起面板。 */
  children: (close: () => void) => ReactNode
}

/**
 * 浮层面板内的紧凑文本按钮（块级 / 表格命令通用）。
 *
 * 与触发器同口径：`onMouseDown` 阻止默认（保选区 / 保焦点），命令在 `onClick` 内现建。
 */
export interface FormatButtonProps {
  /** 已翻译按钮文案（同时作 `aria-label` 与可见文字；给出 `icon` 时隐藏文字、仍作无障碍名）。 */
  label: string
  /** 可选图标：给出时以图标替代可见文字（供紧凑工具条使用，见 TableMenuContent）。 */
  icon?: ReactNode
  /** 是否呈激活态（如当前块即为该格式）。 */
  active?: boolean
  /** 是否禁用。 */
  disabled?: boolean
  /** 危险色调（删除类操作）。 */
  danger?: boolean
  /** 点击回调（在此内建编辑命令链）。 */
  onClick: () => void
}

export function FormatButton({
  label,
  icon,
  active = false,
  disabled = false,
  danger = false,
  onClick
}: FormatButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={`wf-format-pop__btn${icon ? ' wf-format-pop__btn--icon' : ''}${
        active ? ' is-active' : ''
      }${danger ? ' is-danger' : ''}`}
      aria-label={label}
      aria-pressed={active}
      // 仅图标按钮需要原生 tooltip；文字按钮自身即标签（不加冗余 title）。
      title={icon ? label : undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {icon ? (
        <span className="wf-format-pop__btn-glyph" aria-hidden="true">
          {icon}
        </span>
      ) : (
        label
      )}
    </button>
  )
}

/** 面板与触发器之间的垂直间距（px）。 */
const GAP = 8
/** 视口边缘留白（px）。 */
const PAD = 8

interface PanelPosition {
  left: number
  top: number
}

export function FormatPopover({
  editor,
  label,
  icon,
  panelLabel,
  triggerActive = false,
  indicatorColor,
  disabled = false,
  disabledReason,
  width = 236,
  children
}: FormatPopoverProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PanelPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback((): void => setOpen(false), [])

  const isDisabled = disabled || editor === null
  // 禁用 + 给出原因：走 aria-disabled（保留 hover / focus 以展示原因）；否则原生 disabled。
  const reasonShown = isDisabled && disabledReason !== undefined
  const triggerDisabled = isDisabled && !reasonShown

  // 禁用（如光标移出表格）时自动收起：面板随之失效。
  useEffect(() => {
    if (!isDisabled) return undefined
    const id = window.setTimeout(() => setOpen(false), 0)
    return () => window.clearTimeout(id)
  }, [isDisabled])

  // 展开期间：Esc 关闭；指针按下落在触发器 + 面板之外时关闭（面板在 portal 中，
  // 故需同时检查两处引用）。
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open])

  // 定位：以触发器矩形为锚，面板贴其下方左对齐并夹取回视口内；滚动 / 缩放时重算。
  useEffect(() => {
    if (!open) return undefined
    const reposition = (): void => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const panelWidth = width
      const panelHeight = panelRef.current?.offsetHeight ?? 0
      const left = Math.min(
        Math.max(rect.left, PAD),
        Math.max(PAD, window.innerWidth - panelWidth - PAD)
      )
      let top = rect.bottom + GAP
      if (top + panelHeight > window.innerHeight - PAD) {
        // 下方空间不足：上翻贴触发器上方（面板高于视口时夹取到顶部留白）。
        top = Math.max(PAD, rect.top - GAP - panelHeight)
      }
      setPos({ left, top })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, width])

  const panel =
    open && typeof document !== 'undefined'
      ? createPortal(
          // `is-placed`：定位完成（摆脱 visibility: hidden）后才挂上，进场动画以此为
          // 启动条件——否则动画前几帧会在隐藏阶段被消耗（观感等同「突然出现」）。
          <div
            ref={panelRef}
            role="dialog"
            aria-label={panelLabel}
            className={`wf-format-pop${pos ? ' is-placed' : ''}`}
            style={{
              width: `${width}px`,
              left: `${pos?.left ?? 0}px`,
              top: `${pos?.top ?? 0}px`,
              visibility: pos ? 'visible' : 'hidden'
            }}
          >
            {children(close)}
          </div>,
          document.body
        )
      : null

  return (
    <>
      <span className="wf-format-pop-wrap">
        <IconButton
          ref={triggerRef}
          className={`tb-action${triggerActive ? ' is-active' : ''}${
            indicatorColor ? ' wf-format-pop__trigger--ind' : ''
          }`}
          label={label}
          tooltip={reasonShown ? disabledReason : label}
          tooltipPlacement="bottom"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-disabled={reasonShown ? true : undefined}
          disabled={triggerDisabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isDisabled) return
            setOpen((value) => !value)
          }}
        >
          {icon}
          {indicatorColor ? (
            <span
              className="wf-format-pop__ind"
              style={{ background: indicatorColor }}
              aria-hidden="true"
            />
          ) : null}
        </IconButton>
      </span>
      {panel}
    </>
  )
}

export default FormatPopover
