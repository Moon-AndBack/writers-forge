/**
 * 伏笔模块标题栏动作：非编辑态为「竖线 ｜ 加号 ｜ 竖线 ｜ 筛选行」，
 * 聚焦编辑态切换为富文本工具栏（与设定档案 `DossierActivityActions` 同一写法）。
 * 经模块级 action 插槽注册，由外壳标题栏在活动模块为 `foreshadow` 时渲染。
 *
 * 主创建流程仍是正文右键「添加伏笔」（带锚点快照）；此处入口用于手动新建
 * **未锚定**伏笔（复用 `ForeshadowCreateDialog`，锚点传 `{ kind: 'none' }`），
 * 之后可在正文 / 大纲右键「关联伏笔」补上正文埋点 / 大纲埋点。
 *
 * 两态来源：`useRichTextEditor('foreshadow')` 的 `editing` / `editor`（右栏
 * `ForeshadowDescriptionField` 注册 / 上报）。工具栏传 `leadingSeparator={false}`：
 * 组首竖线已由本节点给出，否则编辑态会出现两条紧邻竖线。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton } from '../../../components/ui'
import { useSetActivityActions } from '../../../shell/activityActions'
import { EditorActionSep } from '../../../components/editor/EditorActionGroup'
import { RichTextToolbar } from '../../../components/editor/RichTextToolbar'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import ForeshadowFilterRow from './ForeshadowFilterRow'
import { PlusIcon } from '../icons'

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
          /* 未编辑：「新建」加号 ｜ 筛选行（状态 + 搜索）。 */
          <>
            <IconButton
              className="tb-action"
              label={t('dialog.createTitle')}
              tooltip={t('dialog.createTitle')}
              tooltipPlacement="bottom"
              onClick={onCreate}
            >
              <PlusIcon />
            </IconButton>
            <EditorActionSep />
            <ForeshadowFilterRow bookId={bookId} />
          </>
        )}
      </>
    ),
    [bookId, editing, editor, onCreate, t]
  )

  useSetActivityActions('foreshadow', node)

  return null
}
