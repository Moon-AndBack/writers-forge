/**
 * 伏笔中栏视图：伏笔列表（单卡见 `ForeshadowItem`）。
 *
 * - 空态文案取 `foreshadow` ns 的 `emptyTitle` / `emptyDesc`（提示正文右键创建）；
 * - 创建入口只在正文右键「添加伏笔」（必带锚点快照），本视图不提供手动新建；
 * - 选中 / 详情编辑在右栏（`ForeshadowPanel`），中栏只做列表；
 * - 删除入口只在卡片上（二次确认在本视图持有 `deleteId`），右栏详情不再重复提供。
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/ui'
import ConfirmDialog from '../ConfirmDialog'
import ForeshadowItem from './ForeshadowItem'
import type { ForeshadowBundle } from './foreshadowTree'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import type { OutlineItemRow } from '../outline/outlineTree'

export interface ForeshadowViewProps {
  bundle: ForeshadowBundle
  /** 未删除章（列表卡解析锚点目标名 / 失效判定）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（列表卡补全「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
  /** 未删除大纲条目（同上）。 */
  outlineItems: readonly OutlineItemRow[]
}

export default function ForeshadowView({
  bundle,
  chapters,
  volumes,
  outlineItems
}: ForeshadowViewProps) {
  const { t } = useTranslation('foreshadow')
  const { t: tCommon } = useTranslation('common')
  const { show: showToast, node: toastNode } = useToast()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // 待删除行按 id 从当前列表派生：行已被删除 / 列表刷新后自动失效，不会悬空。
  const deleteRow =
    deleteId === null ? null : (bundle.rows.find((row) => row.id === deleteId) ?? null)

  const handleDeleteConfirm = useCallback(async (): Promise<void> => {
    if (deleteRow === null) return
    setDeleting(true)
    const ok = await bundle.onDelete(deleteRow.id)
    setDeleting(false)
    setDeleteId(null)
    showToast(ok ? t('toast.deleteSuccess') : t('toast.deleteFailed'))
  }, [bundle, deleteRow, showToast, t])

  return (
    <>
      <div className="editor-scroll">
        <div className="editor-inner is-full">
          {bundle.loading && bundle.rows.length === 0 ? (
            <div className="foreshadow-loading">{tCommon('loading')}</div>
          ) : bundle.rows.length === 0 ? (
            <div className="placeholder-view" role="note">
              <div className="placeholder-title">{t('emptyTitle')}</div>
              <div className="placeholder-desc">{t('emptyDesc')}</div>
            </div>
          ) : (
            <div className="foreshadow-grid">
              {bundle.rows.map((row) => (
                <ForeshadowItem
                  key={row.id}
                  row={row}
                  active={row.id === bundle.activeId}
                  chapters={chapters}
                  volumes={volumes}
                  outlineItems={outlineItems}
                  onSelect={bundle.onSelect}
                  onDelete={setDeleteId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {deleteRow === null ? null : (
        <ConfirmDialog
          open
          title={t('dialog.delete.title')}
          message={t('dialog.delete.message', {
            title: deleteRow.title.trim() === '' ? t('field.untitled') : deleteRow.title
          })}
          confirmText={t('dialog.delete.confirm')}
          cancelText={tCommon('cancel')}
          confirming={deleting}
          onConfirm={() => {
            void handleDeleteConfirm()
          }}
          onClose={() => {
            if (!deleting) setDeleteId(null)
          }}
        />
      )}

      {toastNode}
    </>
  )
}
