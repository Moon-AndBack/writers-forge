import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useTranslation } from 'react-i18next'
import { DEFAULT_MENU_WIDTH, EditorContextMenu } from './EditorContextMenu'
import { TableMenuContent } from './TableMenuContent'

/**
 * 大纲编辑区表格**右键上下文菜单**（B1）。
 *
 * 通用壳（挂载 / 拦截 / 定位 / 夹取 / 关闭 / 选区保持）见 `EditorContextMenu`；
 * 本组件只声明两件事：
 * - **接管条件**：仅 `editor.isActive('table')` 时接管（壳另要求编辑器可编辑），
 *   表格外右键不 `preventDefault`，浏览器默认菜单照常；
 * - **菜单内容**：`TableMenuContent`（分区面板，菜单项定义见 `tableMenu`）。
 *
 * 约束：`useEditor` 的 `extensions` / `content` / `editorProps` 必须恒等引用（W11 IME
 * 修复），故菜单状态全部由壳内部持有，不经 `editorProps` 闭包；菜单按钮的
 * `onMouseDown` 阻止默认由 `FormatButton` 负责，以保住编辑器选区。
 */
export interface TableContextMenuProps {
  /** Tiptap 编辑器实例；null 时不挂监听。 */
  editor: Editor | null
}

export function TableContextMenu({ editor }: TableContextMenuProps): ReactNode {
  const { t } = useTranslation('common')

  return (
    <EditorContextMenu
      editor={editor}
      ariaLabel={t('format.tableMenu')}
      title={t('format.tableMenu')}
      // 固定宽度：表格菜单的行列 / 对齐按钮按 2 列网格排布，保持 B1 既有外观（不随内容自适应）。
      width={DEFAULT_MENU_WIDTH}
      className="wf-tablemenu"
      shouldOpen={(instance) => instance.isActive('table')}
    >
      {(close) => <TableMenuContent editor={editor} onDone={close} />}
    </EditorContextMenu>
  )
}

export default TableContextMenu
