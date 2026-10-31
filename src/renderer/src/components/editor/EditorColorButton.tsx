import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { HighlightIcon, TextColorIcon } from '../icons'
import { FormatButton, FormatPopover } from './FormatPopover'
import { FORMAT_PALETTE } from './formatColors'

/**
 * 行内「高亮（背景色）」/「文字颜色（前景色）」下拉按钮（大纲页标题栏，§9 通用化）。
 *
 * 两套独立、可叠加：高亮走 `highlight` mark（`setHighlight` / `unsetHighlight`），
 * 字色走 `textStyle` mark 的 `color` 属性（`setColor` / `unsetColor`）。二者是两个
 * 独立按钮、两套独立选择，但**共用同一份固定色板** `FORMAT_PALETTE`（单一数据源，
 * 见 `formatColors.ts`）——差异只在于角色取 `background` / `foreground` 字段。
 *
 * 下拉面板复用 `FormatPopover`（`createPortal` 逃生标题栏 overflow + `FormatButton`
 * 色块），不新造下拉；触发器图标下方以 `indicatorColor` 色条反映当前选区色值
 * （需求 4：便于用户知道当前是什么色）。
 *
 * ⚠️ 命令链一律在 `onClick` 回调内 `editor.chain().focus()` **现建**（见
 * EditorBlockGroup 说明）。当前色值（供触发器色条与「取消」禁用态）经
 * `useEditorState` 订阅 editor transaction、由 `getAttributes(...).color` 派生；
 * 色块激活态用 `isActive('highlight' | 'textStyle', { color })` 判定。
 */
export type FormatColorRole = 'highlight' | 'text'

export interface EditorColorButtonProps {
  /** Tiptap 编辑器实例；null 时触发器禁用。 */
  editor: Editor | null
  /** 角色：`highlight` = 高亮背景色；`text` = 文字前景色。 */
  role: FormatColorRole
}

interface ColorButtonState {
  /** 当前选区 / 光标处该类 mark 的色值；未设置时为 null。 */
  current: string | null
  editable: boolean
}

const DISABLED_STATE: ColorButtonState = { current: null, editable: false }

/** 读取当前色值（高亮取 `highlight`，字色取 `textStyle.color`）。 */
function readCurrent(editor: Editor, role: FormatColorRole): string | null {
  const value =
    role === 'highlight'
      ? editor.getAttributes('highlight').color
      : editor.getAttributes('textStyle').color
  return typeof value === 'string' && value !== '' ? value : null
}

export function EditorColorButton({ editor, role }: EditorColorButtonProps): ReactNode {
  const { t } = useTranslation('common')

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): ColorButtonState | null =>
        instance === null
          ? null
          : { current: readCurrent(instance, role), editable: instance.isEditable }
    }) ?? DISABLED_STATE

  const isHighlight = role === 'highlight'
  const label = t(isHighlight ? 'highlight' : 'format.textColor')
  const disabled = !state.editable

  return (
    <FormatPopover
      editor={editor}
      icon={isHighlight ? <HighlightIcon /> : <TextColorIcon />}
      label={label}
      panelLabel={label}
      triggerActive={state.current !== null}
      indicatorColor={state.current ?? undefined}
      disabled={disabled}
      width={260}
    >
      {(close) => (
        <>
          <div className="wf-format-pop__title">{label}</div>
          <div className="wf-color-grid" role="group" aria-label={label}>
            {FORMAT_PALETTE.map((entry) => {
              // 高亮取背景色变体，字色取前景色变体（同一色板、同一顺序）。
              const value = isHighlight ? entry.background : entry.foreground
              // 激活态用 mark 属性匹配（高亮 mark / textStyle mark 的 color 属性）。
              const active = editor
                ? isHighlight
                  ? editor.isActive('highlight', { color: value })
                  : editor.isActive('textStyle', { color: value })
                : false
              return (
                <FormatButton
                  key={entry.key}
                  label={t(entry.labelKey)}
                  icon={<span className="wf-color-dot" style={{ background: value }} />}
                  active={active}
                  disabled={disabled}
                  onClick={() => {
                    if (!editor) return
                    if (isHighlight) editor.chain().focus().setHighlight({ color: value }).run()
                    else editor.chain().focus().setColor(value).run()
                    close()
                  }}
                />
              )
            })}
          </div>
        </>
      )}
    </FormatPopover>
  )
}

export default EditorColorButton
