import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { TableIcon } from '../icons'
import { FormatButton, FormatPopover } from './FormatPopover'

/**
 * 大纲页「表格」分组（表格插入）。
 *
 * - 表格：`insertTable({ rows, cols, withHeaderRow })`（`@tiptap/extension-table`）。
 *
 * 面板内容由 `FormatPopover` 的渲染函数在**每次展开**时重新挂载（关闭即卸载），
 * 故 `InsertBody` 的 `useState` 初始值随每次打开重算，无需手动重置。
 * 面板**不自动聚焦**输入框：置焦事件会牵动编辑器 blur 链路（`useOutlineSearch` 的
 * 选区同步 / IME 收尾），保持与其它分组一致「纯点击」路径更稳。
 * 所有命令链在 `onClick` 内 `editor.chain().focus()` 现建（见 EditorBlockGroup 说明）。
 */
export interface EditorInsertGroupProps {
  /** Tiptap 编辑器实例；null 时触发器禁用。 */
  editor: Editor | null
}

/** 表格插入默认行列数（与 Tiptap 命令默认一致）。 */
const DEFAULT_ROWS = 3
/** 表格插入默认列数。 */
const DEFAULT_COLS = 3

interface InsertState {
  editable: boolean
}

const DISABLED_STATE: InsertState = { editable: false }

export function EditorInsertGroup({ editor }: EditorInsertGroupProps): ReactNode {
  const { t } = useTranslation('common')

  return (
    <FormatPopover
      editor={editor}
      icon={<TableIcon />}
      label={t('format.tableGroup')}
      panelLabel={t('format.tableGroup')}
      width={240}
    >
      {(close) => <InsertBody editor={editor} onDone={close} />}
    </FormatPopover>
  )
}

interface InsertBodyProps {
  editor: Editor | null
  /** 提交后收起面板。 */
  onDone: () => void
}

function InsertBody({ editor, onDone }: InsertBodyProps): ReactNode {
  const { t } = useTranslation('common')
  const [rows, setRows] = useState(DEFAULT_ROWS)
  const [cols, setCols] = useState(DEFAULT_COLS)
  const [withHeaderRow, setWithHeaderRow] = useState(true)

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): InsertState | null =>
        instance === null ? null : { editable: instance.isEditable }
    }) ?? DISABLED_STATE

  const disabled = !state.editable

  const clampCount = (value: number): number => {
    if (!Number.isFinite(value)) return 1
    return Math.min(20, Math.max(1, Math.trunc(value)))
  }

  const insertTable = (): void => {
    if (disabled) return
    editor
      ?.chain()
      .focus()
      .insertTable({ rows: clampCount(rows), cols: clampCount(cols), withHeaderRow })
      .run()
    onDone()
  }

  return (
    <>
      <div className="wf-format-pop__section">
        <div className="wf-format-pop__title">{t('format.insertTable')}</div>
        <div className="wf-format-pop__row">
          <span className="wf-format-pop__row-label">{t('format.tableRows')}</span>
          <input
            className="wf-format-pop__num"
            type="number"
            min={1}
            max={20}
            value={rows}
            aria-label={t('format.tableRows')}
            disabled={disabled}
            onChange={(event) => setRows(Number(event.target.value))}
          />
        </div>
        <div className="wf-format-pop__row">
          <span className="wf-format-pop__row-label">{t('format.tableCols')}</span>
          <input
            className="wf-format-pop__num"
            type="number"
            min={1}
            max={20}
            value={cols}
            aria-label={t('format.tableCols')}
            disabled={disabled}
            onChange={(event) => setCols(Number(event.target.value))}
          />
        </div>
        <label className="wf-format-pop__row wf-format-pop__check">
          <input
            type="checkbox"
            checked={withHeaderRow}
            disabled={disabled}
            onChange={(event) => setWithHeaderRow(event.target.checked)}
          />
          <span className="wf-format-pop__row-label wf-format-pop__row-label--wide">
            {t('format.tableHeaderRow')}
          </span>
        </label>
        <div className="wf-format-pop__actions">
          <FormatButton label={t('format.insertTable')} disabled={disabled} onClick={insertTable} />
        </div>
      </div>
    </>
  )
}

export default EditorInsertGroup
