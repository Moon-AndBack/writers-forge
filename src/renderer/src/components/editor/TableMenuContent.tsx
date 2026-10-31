import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { FormatButton } from './FormatPopover'
import {
  DISABLED_TABLE_MENU_STATE,
  TABLE_MENU_SECTIONS,
  gridClassFor,
  selectTableMenuState,
  type TableMenuSection
} from './tableMenu'

/**
 * 表格右键上下文菜单内容（唯一呈现层）。
 *
 * 菜单项定义（命令 / 文案 / 可用性）统一取自 `tableMenu.ts` 的 `TABLE_MENU_SECTIONS`
 * ——不存在第二套平行实现（§9）：竖向分区面板，2 列网格、依 `columns` 取修饰类。
 *
 * 共用口径（与 `EditorBlockGroup` 逐条一致）：
 * - 命令链一律在 `onClick` 回调内由 `item.run(editor)` 现建，**不在渲染期建链**；
 * - 所有按钮 `onMouseDown` 阻止默认（保编辑器选区 / 焦点）；
 * - 状态经 `useEditorState` 订阅 editor transaction 派生。
 */
export interface TableMenuContentProps {
  /** Tiptap 编辑器实例；null 时整块只读禁用。 */
  editor: Editor | null
  /** 选中某项后回调（右键菜单据此收起自身）。 */
  onDone?: () => void
}

export const TableMenuContent = ({ editor, onDone }: TableMenuContentProps): ReactNode => {
  const { t } = useTranslation('common')

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }) => selectTableMenuState(instance)
    }) ?? DISABLED_TABLE_MENU_STATE

  // 统一口径：仅「光标在表格内且可编辑」时命令可用。
  const disabled = !(state.inTable && state.editable)

  const renderItem = (item: TableMenuSection['items'][number]): ReactNode => {
    const label = t(item.labelKey)
    const enabled = !disabled && (item.enabled ? item.enabled(state) : true)
    return (
      <FormatButton
        key={item.key}
        label={label}
        active={item.active ? item.active(state) : false}
        disabled={!enabled}
        danger={item.danger}
        onClick={() => {
          if (!editor || !enabled) return
          item.run(editor)
          onDone?.()
        }}
      />
    )
  }

  return (
    <>
      {TABLE_MENU_SECTIONS.map((section) => (
        <div key={section.key} className="wf-format-pop__section">
          <div className={gridClassFor(section)}>{section.items.map(renderItem)}</div>
        </div>
      ))}
    </>
  )
}

export default TableMenuContent
