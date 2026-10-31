import type { Editor } from '@tiptap/core'

/**
 * 表格右键上下文菜单的菜单项定义（单一来源，§9 通用化）。
 *
 * 本模块为纯数据 / 纯函数（无 JSX），故不触发 `react-refresh/only-export-components`；
 * 呈现层见 `TableMenuContent`（竖向分区面板）。
 *
 * ⚠️ 命令链一律在 `run` 内部 `editor.chain().focus()` **现建**——`run` 只在
 * 点击回调里被调用（见 TableMenuContent 的 onClick），不得在渲染期执行，
 * 否则会冻结旧选区快照，导致「选中单元格后点命令无效」（与 EditorBlockGroup 同口径）。
 */

/** 单元格水平对齐（TableKit 内置 `align` 属性；未设置时按 `left` 呈现）。 */
export type TableAlign = 'left' | 'center' | 'right'

/** 表格菜单项可用 / 激活态判定所需的派生状态。 */
export interface TableMenuState {
  /** 光标 / 选区位于表格内。 */
  inTable: boolean
  /** 编辑器可编辑。 */
  editable: boolean
  /** 当前选区可合并（多单元格）。 */
  canMerge: boolean
  /** 当前单元格可拆分（含合并格）。 */
  canSplit: boolean
  /** 当前单元格对齐（未设置时按 `left`）。 */
  align: TableAlign
}

/** 无编辑器时的兜底状态（一切命令禁用）。 */
export const DISABLED_TABLE_MENU_STATE: TableMenuState = {
  inTable: false,
  editable: false,
  canMerge: false,
  canSplit: false,
  align: 'left'
}

/** 读取当前单元格对齐：先 `tableCell` 再 `tableHeader`，非法值回退 `left`。 */
function readAlign(editor: Editor): TableAlign {
  const value = (editor.getAttributes('tableCell').align ??
    editor.getAttributes('tableHeader').align) as unknown
  return value === 'center' || value === 'right' ? value : 'left'
}

/** 从编辑器派生菜单状态（`useEditorState` 的 selector 直接引用本函数）。 */
export function selectTableMenuState(editor: Editor | null): TableMenuState | null {
  if (editor === null) return null
  const inTable = editor.isActive('table')
  return {
    inTable,
    editable: editor.isEditable,
    canMerge: inTable && editor.can().mergeCells(),
    canSplit: inTable && editor.can().splitCell(),
    align: inTable ? readAlign(editor) : 'left'
  }
}

/**
 * 菜单项文案 key（限定在 `common` ns 的 `format.*` 子集）。
 * 收窄为字面量联合，保证 `t(item.labelKey)` 在 zh-CN 真源类型下仍可校验。
 */
export type TableMenuLabelKey =
  | 'format.alignCenter'
  | 'format.alignLeft'
  | 'format.alignRight'
  | 'format.colAfter'
  | 'format.colBefore'
  | 'format.colDelete'
  | 'format.headerCol'
  | 'format.headerRow'
  | 'format.mergeCells'
  | 'format.rowAfter'
  | 'format.rowBefore'
  | 'format.rowDelete'
  | 'format.splitCell'
  | 'format.tableDelete'

/**
 * 菜单项 key：同时用作 React key 与 `TableMenuItem.key` 的字面量类型，两处保持一致。
 */
export type TableMenuItemKey =
  | 'rowBefore'
  | 'rowAfter'
  | 'rowDelete'
  | 'colBefore'
  | 'colAfter'
  | 'colDelete'
  | 'mergeCells'
  | 'splitCell'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'headerRow'
  | 'headerCol'
  | 'tableDelete'

export interface TableMenuItem {
  /** 稳定 key（React key 与菜单项标识）。 */
  key: TableMenuItemKey
  /** `common` ns 下的文案 key。 */
  labelKey: TableMenuLabelKey
  /** 危险色调（删除类）。 */
  danger?: boolean
  /** 执行命令：**在此内部现建命令链**（已在点击回调内调用）。 */
  run: (editor: Editor) => void
  /** 逐项可用性（默认可用；仅「光标在表内且可编辑」已由外层统一判定）。 */
  enabled?: (state: TableMenuState) => boolean
  /** 激活态（互斥集合，如对齐三态）。 */
  active?: (state: TableMenuState) => boolean
}

export interface TableMenuSection {
  /** 分区 key。 */
  key: string
  /** 面板版面列数：1 = 独占一行，2 = 双列，3（默认）= 三列。 */
  columns?: 1 | 2 | 3
  items: TableMenuItem[]
}

/** 对齐三态（单选互斥，故逐项给出 active）。 */
const ALIGN_ITEMS: TableMenuItem[] = [
  {
    key: 'alignLeft',
    labelKey: 'format.alignLeft',
    active: (state) => state.align === 'left',
    run: (editor) => {
      editor.chain().focus().setCellAttribute('align', 'left').run()
    }
  },
  {
    key: 'alignCenter',
    labelKey: 'format.alignCenter',
    active: (state) => state.align === 'center',
    run: (editor) => {
      editor.chain().focus().setCellAttribute('align', 'center').run()
    }
  },
  {
    key: 'alignRight',
    labelKey: 'format.alignRight',
    active: (state) => state.align === 'right',
    run: (editor) => {
      editor.chain().focus().setCellAttribute('align', 'right').run()
    }
  }
]

/**
 * 表格菜单分区（顺序即渲染顺序）：
 * 行列增删 ｜ 合并拆分 ｜ 对齐 ｜ 表头开关 ｜ 删除表格。
 */
export const TABLE_MENU_SECTIONS: TableMenuSection[] = [
  {
    key: 'rowcol',
    columns: 2,
    items: [
      {
        key: 'rowBefore',
        labelKey: 'format.rowBefore',
        run: (editor) => {
          editor.chain().focus().addRowBefore().run()
        }
      },
      {
        key: 'rowAfter',
        labelKey: 'format.rowAfter',
        run: (editor) => {
          editor.chain().focus().addRowAfter().run()
        }
      },
      {
        key: 'rowDelete',
        labelKey: 'format.rowDelete',
        danger: true,
        run: (editor) => {
          editor.chain().focus().deleteRow().run()
        }
      },
      {
        key: 'colBefore',
        labelKey: 'format.colBefore',
        run: (editor) => {
          editor.chain().focus().addColumnBefore().run()
        }
      },
      {
        key: 'colAfter',
        labelKey: 'format.colAfter',
        run: (editor) => {
          editor.chain().focus().addColumnAfter().run()
        }
      },
      {
        key: 'colDelete',
        labelKey: 'format.colDelete',
        danger: true,
        run: (editor) => {
          editor.chain().focus().deleteColumn().run()
        }
      }
    ]
  },
  {
    key: 'merge',
    columns: 2,
    items: [
      {
        key: 'mergeCells',
        labelKey: 'format.mergeCells',
        enabled: (state) => state.canMerge,
        run: (editor) => {
          editor.chain().focus().mergeCells().run()
        }
      },
      {
        key: 'splitCell',
        labelKey: 'format.splitCell',
        enabled: (state) => state.canSplit,
        run: (editor) => {
          editor.chain().focus().splitCell().run()
        }
      }
    ]
  },
  {
    key: 'align',
    items: ALIGN_ITEMS
  },
  {
    key: 'header',
    columns: 2,
    items: [
      {
        key: 'headerRow',
        labelKey: 'format.headerRow',
        run: (editor) => {
          editor.chain().focus().toggleHeaderRow().run()
        }
      },
      {
        key: 'headerCol',
        labelKey: 'format.headerCol',
        run: (editor) => {
          editor.chain().focus().toggleHeaderColumn().run()
        }
      }
    ]
  },
  {
    key: 'delete',
    columns: 1,
    items: [
      {
        key: 'tableDelete',
        labelKey: 'format.tableDelete',
        danger: true,
        run: (editor) => {
          editor.chain().focus().deleteTable().run()
        }
      }
    ]
  }
]

/**
 * 面板版面下某分区的网格类名（3 列为基类默认；1 / 2 列取修饰类）。
 */
export function gridClassFor(section: TableMenuSection): string {
  if (section.columns === 1) return 'wf-format-pop__grid wf-format-pop__grid--stack'
  if (section.columns === 2) return 'wf-format-pop__grid wf-format-pop__grid--pair'
  return 'wf-format-pop__grid'
}
