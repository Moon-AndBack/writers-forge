/**
 * 写作模块标题栏动作组（伏笔 / 灵感 / 设定档案共用，§9）。
 *
 * 统一结构（左 → 右）：
 * - 组首竖线：与左侧书名分隔，写作模块标题栏动作组统一以此线开头；
 * - `leading`（可选）：紧随组首线、排在所有动作之前，自带尾随竖线者由调用方给出
 *   （势力的「卡片 / 架构」分段控件即此形态）；**编辑态与非编辑态都保留**；
 * - 按右栏正文编辑器聚焦态两态切换：
 *   - 编辑中：`RichTextToolbar`，`leadingSeparator={false}`——组首线已由本组件给出，
 *     否则会出现两条紧邻竖线；
 *   - 未编辑：「新建」加号 ｜ 竖线 ｜ `filterRow`（各域筛选行）。
 *
 * 差异只经三项注入：`createLabel`（各域 `t()` 文案）、`leading`（可选前置控件）、
 * `filterRow`（节点，props 由各域原样透传）。文案统一「标签 = tooltip」。
 *
 * 位置说明：本组件属写作页层（`pages/writer`），因复用同层内联 `PlusIcon`；
 * 放到 `components/` 会反向引用 `pages/`（分层倒挂，见 `components/icons.tsx`）。
 */
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { IconButton } from '../../components/ui'
import { EditorActionSep } from '../../components/editor/EditorActionGroup'
import { RichTextToolbar } from '../../components/editor/RichTextToolbar'
import { PlusIcon } from './icons'

export interface ModuleActivityActionsProps {
  /** 「新建」按钮的标签 / tooltip（各域自带命名空间文案）。 */
  createLabel: string
  /** 打开「新建」弹窗（弹窗本体由各域挂载）。 */
  onCreate: () => void
  /** 组首竖线之后、两态内容之前的可选节点（势力视图切换；可自带尾随竖线）。 */
  leading?: ReactNode
  /** 非编辑态显示的筛选行节点（各域自行注入 props）。 */
  filterRow: ReactNode
  /** 右栏正文编辑器实例（`null` 时工具栏各分组置灰）。 */
  editor: Editor | null
  /** 归属书 id（工具栏插图按书隔离入库）。 */
  bookId?: string
  /** 右栏正文编辑器是否聚焦编辑中（决定工具栏 / 加号 + 筛选行两态）。 */
  editing: boolean
}

/** 写作模块标题栏动作组：组首线 + 可选前置 + 编辑态工具栏 / 非编辑态加号与筛选行。 */
export function ModuleActivityActions({
  createLabel,
  onCreate,
  leading,
  filterRow,
  editor,
  bookId,
  editing
}: ModuleActivityActionsProps): ReactNode {
  return (
    <>
      {/* 组首竖线：与左侧书名分隔；写作模块标题栏动作组统一以此线开头。 */}
      <EditorActionSep />
      {leading}
      {editing ? (
        /* 聚焦编辑：组首线已由本节点给出，工具栏不再重复，避免编辑态出现双线。 */
        <RichTextToolbar
          editor={editor}
          bookId={bookId}
          className="tb-editor-actions"
          leadingSeparator={false}
        />
      ) : (
        /* 未编辑：「新建」加号 ｜ 筛选行（各域内容由 filterRow 注入）。 */
        <>
          <IconButton
            className="tb-action"
            label={createLabel}
            tooltip={createLabel}
            tooltipPlacement="bottom"
            onClick={onCreate}
          >
            <PlusIcon />
          </IconButton>
          <EditorActionSep />
          {filterRow}
        </>
      )}
    </>
  )
}

export default ModuleActivityActions
