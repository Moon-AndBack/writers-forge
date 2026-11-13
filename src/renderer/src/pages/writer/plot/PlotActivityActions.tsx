import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { RichTextToolbar } from '../../../components/editor/RichTextToolbar'
import { usePlotEditor } from './plotEditorContext'
import { PlusIcon } from '../icons'

export interface PlotActivityActionsProps {
  /** 打开「新建剧情线」聚合弹窗（弹窗本体挂载在剧情视图内）。 */
  onAdd: () => void
  /** 禁用新建入口（时间线尚未加载时避免新剧情线落到不存在的默认时间线）。 */
  disabled?: boolean
}

/**
 * 剧情页标题栏操作按钮组：经模块级 action 插槽（useSetActivityActions）注册，
 * 由外壳标题栏在「返回书架」图标右侧渲染（`.tb-module-actions`）。
 *
 * 按右栏正文编辑器的聚焦态（`editing`，经 `usePlotWorkspace` 上提、由
 * `plot` 槽位透传）**两态切换**：
 * - **未编辑**：单个「新建剧情线」按钮（点击弹 `PlotLineDialog` 三字段弹窗落库）；
 * - **聚焦编辑中**：富文本工具栏（对照大纲页能力组合）——撤销 · 重做 ｜ 行内格式
 *   （加粗 / 斜体 / 下划线 / 删除线 / 行内代码 / 字色 / 高亮）｜ 标题 ▾ · 段落 ▾ ·
 *   表格 ▾ · 链接 ▾ · 图片 ▾ ｜ 清除格式。**不含**保存（保存仍在右栏手动触发），
 *   也不含搜索 / 回收站（剧情域无此）。
 *
 * 工具栏本体为通用组件 `components/editor/RichTextToolbar`（§9：与设定库正文共用），
 * 此处只决定**何时**渲染；`editor` 实例由右栏 `PlotBodyEditor` 注册进
 * `richTextEditorContext` 的 `plot` 槽位（两处分处不同子树，需共同祖先中转）。
 *
 * ⚠️ 选区保持：`RichTextToolbar` 容器 `onMouseDown` 统一 `preventDefault`——否则点击任一
 * 按钮会先使编辑器失焦 → `editing` 转 false → 工具栏在 click 派发前卸载，命令无从执行
 * （与 `FormatPopover` / `EditorFormatGroup` 的选区保持同口径）。
 */
export default function PlotActivityActions({ onAdd, disabled = false }: PlotActivityActionsProps) {
  const { t } = useTranslation('plot')
  // 右栏正文编辑器共享态（editor 实例 + 聚焦态 + 归属书 id）；无 Provider 时为空。
  const { editor, editing, bookId } = usePlotEditor()

  const node = useMemo(
    () =>
      editing ? (
        /* 聚焦编辑：富文本工具栏（容器 onMouseDown 阻止默认，保编辑器选区 / 聚焦）。 */
        <RichTextToolbar editor={editor} bookId={bookId} className="tb-editor-actions" />
      ) : (
        /* 未编辑：沿用原「新建剧情线」入口。 */
        <>
          <EditorActionSep />
          <IconButton
            className="tb-action"
            label={t('newLine')}
            tooltip={t('newLine')}
            tooltipPlacement="bottom"
            disabled={disabled}
            onClick={onAdd}
          >
            <PlusIcon />
          </IconButton>
        </>
      ),
    [editing, editor, bookId, t, onAdd, disabled]
  )

  // 注册到模块级 action 插槽（'plot'）：外壳标题栏读取并在返回图标右侧渲染。
  useSetActivityActions('plot', node)

  return null
}
