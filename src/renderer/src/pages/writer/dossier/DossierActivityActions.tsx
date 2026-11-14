import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, Segmented } from '../../../components/ui'
import { useModuleLabel } from '../../../shell/activityBarModules'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { RichTextToolbar } from '../../../components/editor/RichTextToolbar'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import { PlusIcon } from '../icons'
import type { DossierModule } from './dossierTree'

/** 势力模块的「卡片 / 架构」切换配置；其它四域不传，标题栏不渲染切换器。 */
export interface DossierViewSwitch {
  mode: 'cards' | 'org'
  onChange: (mode: 'cards' | 'org') => void
}

export interface DossierActivityActionsProps {
  /** 所属域（同时作为 action 插槽键）。 */
  module: DossierModule
  /** 打开「新建」弹窗（弹窗本体挂载在中栏卡片视图内）。 */
  onCreate: () => void
  /** 标题栏动作组首位的视图切换（仅势力模块）。 */
  view?: DossierViewSwitch
}

/**
 * 设定档案五域标题栏操作按钮组：经模块级 action 插槽（`useSetActivityActions`）注册，
 * 由外壳标题栏在当前活动模块为该域时渲染（位置：返回书架图标右侧，与章节 / 剧情一致）。
 *
 * 势力模块的「卡片 / 架构」切换固定排在动作组首位（`view`），编辑态与非编辑态
 * **都保留**——否则点进正文后切换器消失，必须先失焦才能切视图。
 *
 * 按右栏正文编辑器的聚焦态（`useRichTextEditor('dossier').editing`，真源在
 * `Writer.tsx`、由 `DossierBodyEditor` 上报）**两态切换**：
 * - **未编辑**：单个「新建{{模块名}}」加号按钮（点击弹 `DossierCreateDialog` 落库）；
 * - **聚焦编辑中**：富文本工具栏（`RichTextToolbar`，与剧情正文 / 大纲同一套组件）——
 *   撤销 · 重做 ｜ 行内格式 ｜ 标题 · 段落 · 表格 · 链接 · 图片 ｜ 清除格式。
 *   正文保存为手动保存（右栏底部「保存」按钮），工具栏不含保存入口。
 *
 * 编辑器实例与聚焦态经通用注册表 `components/editor/richTextEditorContext` 中转：
 * `editor` 在右栏 `DossierBodyEditor` 内创建、本组件在中栏子树，二者需共同祖先
 * （`Writer.tsx` 的 `RichTextEditorProvider`）——与剧情线同一机制（§9）。
 *
 * ⚠️ 选区保持：`RichTextToolbar` 容器 `onMouseDown` 统一 `preventDefault`——否则点击任一
 * 按钮会先使正文失焦 → `editing` 转 false → 工具栏在 click 派发前卸载，命令无从执行。
 */
export default function DossierActivityActions({
  module,
  onCreate,
  view
}: DossierActivityActionsProps) {
  const { t } = useTranslation('dossier')
  const moduleLabel = useModuleLabel(module)
  // 右栏正文编辑器共享态（实例 + 聚焦态 + 归属书 id）；无 Provider 时为空值。
  const { editor, editing, bookId } = useRichTextEditor('dossier')

  const node = useMemo(() => {
    /* 视图切换器：仅势力模块，固定排在动作组首位；后接竖分隔线与后续动作。 */
    const viewSwitch =
      view !== undefined ? (
        <>
          <span className="tb-view-switch">
            <Segmented
              size="sm"
              value={view.mode}
              onChange={view.onChange}
              aria-label={t('orgChart.viewLabel')}
              options={[
                { value: 'cards', label: t('orgChart.viewCards') },
                { value: 'org', label: t('orgChart.viewTree') }
              ]}
            />
          </span>
          <EditorActionSep />
        </>
      ) : null

    return (
      <>
        {viewSwitch}
        {editing ? (
          /* 聚焦编辑：富文本工具栏（容器 onMouseDown 阻止默认，保正文选区 / 聚焦）。 */
          <RichTextToolbar editor={editor} bookId={bookId} className="tb-editor-actions" />
        ) : (
          /* 未编辑：沿用原「新建」入口；无视图切换器时保留组首竖分隔线。 */
          <>
            {view === undefined ? <EditorActionSep /> : null}
            <IconButton
              className="tb-action"
              label={t('createAction', { module: moduleLabel })}
              tooltip={t('createAction', { module: moduleLabel })}
              tooltipPlacement="bottom"
              onClick={onCreate}
            >
              <PlusIcon />
            </IconButton>
          </>
        )}
      </>
    )
  }, [editing, editor, bookId, onCreate, t, moduleLabel, view])

  useSetActivityActions(module, node)

  return null
}
