/**
 * 设定档案五域标题栏动作：经模块级 action 插槽注册，由外壳标题栏按当前活动域渲染。
 * 顺序：组首 ｜（势力：[卡片 / 架构] ｜）新建{模块名} ｜ 筛选行；组首线、两态与
 * `leadingSeparator={false}` 的防双线由 `ModuleActivityActions` 统一处理。
 *
 * 势力的视图切换（`view`）编辑态与非编辑态**都保留**，否则点进正文后无法切视图；
 * 切换器自带尾随竖线。编辑态为 `RichTextToolbar`（正文手动保存，无保存入口）。
 *
 * 注：竖线为纯装饰，教学书种子（`seedGuideBook/`）无需同步。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '../../../components/ui'
import { useModuleLabel } from '../../../shell/activityBarModules'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import ModuleActivityActions from '../ModuleActivityActions'
import DossierFilterRow from './DossierFilterRow'
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
    /* 视图切换器：仅势力模块，紧随组首竖线、排在所有动作之前；自带尾随竖线。 */
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
      <ModuleActivityActions
        createLabel={t('createAction', { module: moduleLabel })}
        onCreate={onCreate}
        leading={viewSwitch}
        filterRow={<DossierFilterRow module={module} />}
        editor={editor}
        bookId={bookId}
        editing={editing}
      />
    )
  }, [editing, editor, bookId, module, onCreate, t, moduleLabel, view])

  useSetActivityActions(module, node)

  return null
}
