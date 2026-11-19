/**
 * 灵感模块标题栏动作：非编辑态「加号 ｜ 标签筛选行」，编辑态富文本工具栏；
 * 结构与伏笔、设定档案共用 `ModuleActivityActions`。
 * 新建为空白条目，成功后由中栏视图选中并展开右栏详情。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetActivityActions } from '../../../shell/activityActions'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import ModuleActivityActions from '../ModuleActivityActions'
import InspirationFilterRow from './InspirationFilterRow'

export interface InspirationActivityActionsProps {
  /** 新建一条空白灵感（有未保存草稿时由装配包挂起两态确认）。 */
  onCreate: () => void
}

export default function InspirationActivityActions({ onCreate }: InspirationActivityActionsProps) {
  const { t } = useTranslation('inspiration')
  // 右栏正文编辑器共享态：实例 + 聚焦态 + 归属书 id（无 Provider 时为空值）。
  const { editor, editing, bookId } = useRichTextEditor('inspiration')

  const node = useMemo(
    () => (
      <ModuleActivityActions
        createLabel={t('action.create')}
        onCreate={onCreate}
        filterRow={<InspirationFilterRow />}
        editor={editor}
        bookId={bookId}
        editing={editing}
      />
    ),
    [bookId, editing, editor, onCreate, t]
  )

  useSetActivityActions('inspiration', node)

  return null
}
