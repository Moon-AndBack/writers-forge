import { useEffect, useRef, useState } from 'react'

export interface PopupSelectOption {
  /** 弹窗项展示名 */
  label: string
  /** 选项值（即对应 CSS 变量的字面值） */
  value: string
}

interface PopupSelectProps {
  /** 胶囊按钮文案（当前项的展示名） */
  buttonLabel: string
  /** 弹窗整体 aria-label（如「正文字体」） */
  popupLabel: string
  options: readonly PopupSelectOption[]
  /** 当前选中值 */
  value: string
  /** 选中回调（选中后弹窗自动关闭） */
  onChange: (value: string) => void
}

/**
 * 状态栏排版胶囊（`.st-pill-wrap`）：按钮 + 向上弹出面板。
 *
 * 复用 ThemeSwitcherPopover 的开关范式：展开期间 Esc 关闭；
 * 指针按下落在根节点（按钮 + 弹窗）之外时关闭；选中项加 `is-active` 并显示 ✓。
 * 弹窗经条件渲染挂载（`open ? ... : null`），浮层样式见 statusbar-widgets.css。
 */
export default function PopupSelect({
  buttonLabel,
  popupLabel,
  options,
  value,
  onChange
}: PopupSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="st-pill-wrap" ref={rootRef}>
      <button
        type="button"
        className={`st-pill-btn${open ? ' is-open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {buttonLabel}
      </button>

      {open ? (
        <div className="st-popup" role="dialog" aria-label={popupLabel}>
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                className={`st-popup-item${selected ? ' is-active' : ''}`}
                aria-pressed={selected}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
                <span className="check" aria-hidden="true">
                  ✓
                </span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
