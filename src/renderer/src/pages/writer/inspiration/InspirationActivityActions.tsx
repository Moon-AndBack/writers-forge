/**
 * 灵感模块标题栏动作：非编辑态为「竖线 ｜ 加号 ｜ 竖线 ｜ 筛选行」，
 * 聚焦编辑态切换为富文本工具栏（与设定档案 `DossierActivityActions` 同一写法）。
 * 经模块级 action 插槽注册，由外壳标题栏在活动模块为 `inspiration` 时渲染。
 *
 * 新建为空白条目（标题 / 正文 / 标签均可后补），成功后由中栏视图选中并展开右栏详情。
 *
 * 两态来源：`useRichTextEditor('inspiration')` 的 `editing` / `editor`（右栏
 * `InspirationBodyField` 注册 / 上报；`bookId` 由 Provider 统一提供，供工具栏插图）。
 * 工具栏传 `leadingSeparator={false}`：组首竖线已由本节点给出，否则编辑态会出现双线。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { RichTextToolbar } from '../../../components/editor/RichTextToolbar'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import InspirationFilterRow from './InspirationFilterRow'
import { PlusIcon } from '../icons'

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
      <>
        {/* 组首竖线：与左侧书名分隔；写作模块标题栏动作组统一以此线开头。 */}
        <EditorActionSep />
        {editing ? (
          /* 聚焦编辑：富文本工具栏（容器 onMouseDown 阻止默认，保正文选区 / 聚焦）。 */
          <RichTextToolbar
            editor={editor}
            bookId={bookId}
            className="tb-editor-actions"
            leadingSeparator={false}
          />
        ) : (
          /* 未编辑：「新建」加号 ｜ 筛选行（标签 + 搜索）。 */
          <>
            <IconButton
              className="tb-action"
              label={t('action.create')}
              tooltip={t('action.create')}
              tooltipPlacement="bottom"
              onClick={onCreate}
            >
              <PlusIcon />
            </IconButton>
            <EditorActionSep />
            <InspirationFilterRow />
          </>
        )}
      </>
    ),
    [bookId, editing, editor, onCreate, t]
  )

  useSetActivityActions('inspiration', node)

  return null
}
