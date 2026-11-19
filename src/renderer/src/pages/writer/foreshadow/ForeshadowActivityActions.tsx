/**
 * 伏笔模块标题栏动作：非编辑态「加号 ｜ 状态筛选行」，编辑态富文本工具栏；
 * 结构与灵感、设定档案共用 `ModuleActivityActions`（组首线 / 防双线在其中统一）。
 * 此处只新建**未锚定**伏笔；正文右键「添加伏笔」仍带锚点快照。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetActivityActions } from '../../../shell/activityActions'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import ModuleActivityActions from '../ModuleActivityActions'
import ForeshadowFilterRow from './ForeshadowFilterRow'

export interface ForeshadowActivityActionsProps {
  /** 当前路由书 id（筛选行按书读写条件；工具栏插图按书隔离入库）。 */
  bookId: string
  /** 打开「新建伏笔」弹窗（弹窗本体挂载在中栏视图内）。 */
  onCreate: () => void
}

export default function ForeshadowActivityActions({
  bookId,
  onCreate
}: ForeshadowActivityActionsProps) {
  const { t } = useTranslation('foreshadow')
  // 右栏描述编辑器共享态：实例 + 聚焦态（无 Provider 时为空值 / 未编辑）。
  const { editor, editing } = useRichTextEditor('foreshadow')

  const node = useMemo(
    () => (
      <ModuleActivityActions
        createLabel={t('dialog.createTitle')}
        onCreate={onCreate}
        filterRow={<ForeshadowFilterRow bookId={bookId} />}
        editor={editor}
        bookId={bookId}
        editing={editing}
      />
    ),
    [bookId, editing, editor, onCreate, t]
  )

  useSetActivityActions('foreshadow', node)

  return null
}
