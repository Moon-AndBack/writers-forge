/**
 * 灵感中栏视图：标题栏「新建」动作 + 灵感卡片网格。
 *
 * - 卡片结构见 `InspirationCard`（通用壳 `EntityStyleCard`，与伏笔 / 设定档案同款）；
 * - 筛选 / 搜索入口在活动栏模块浮层（`ActivityBarFilterPopover` + `InspirationFilterProvider`），
 *   中栏只读条件并消费已过滤的行；不再保留顶部下拉筛选条；
 * - 选中 / 详情编辑在右栏（`InspirationPanel`），中栏只做列表；
 * - 删除入口在卡片上（二次确认在本视图持有 `deleteId`）。
 */
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { useToast } from '../../../components/ui'
import ConfirmDialog from '../ConfirmDialog'
import InspirationActivityActions from './InspirationActivityActions'
import InspirationCard from './InspirationCard'
import { useInspirationFilters } from './inspirationFilterContext'
import type { InspirationBundle } from './inspirationTree'

export interface InspirationViewProps {
  bundle: InspirationBundle
}

export default function InspirationView({ bundle }: InspirationViewProps) {
  const { t } = useTranslation('inspiration')
  const { t: tCommon } = useTranslation('common')
  const { filters } = useInspirationFilters()
  const { show: showToast, node: toastNode } = useToast()
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  /** 当前是否有筛选条件（标签或非空关键词）：用于区分「无数据」与「筛空」空态。 */
  const hasFilter = filters.tag !== null || filters.query.trim() !== ''

  // 待删除行按 id 从当前列表派生：行已被删除 / 列表刷新后自动失效，不会悬空。
  const deleteRow =
    deleteId === null ? null : (bundle.rows.find((row) => row.id === deleteId) ?? null)

  const handleCreate = useCallback((): void => {
    // 有未保存草稿时先挂起（新建会切走当前详情，交右栏两态确认后再创建）。
    bundle.guardSwitch(() => {
      void bundle.onCreate().then((ok) => {
        showToast(ok ? t('toast.createSuccess') : t('toast.createFailed'))
      })
    })
  }, [bundle, showToast, t])

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
      <InspirationActivityActions onCreate={handleCreate} />

      <div className="editor-scroll">
        <div className="editor-inner is-full">
          {bundle.loading ? (
            <div className="inspiration-loading">{tCommon('loading')}</div>
          ) : bundle.rows.length === 0 ? (
            <EmptyState
              title={hasFilter ? t('emptyFilteredTitle') : t('emptyTitle')}
              description={hasFilter ? t('emptyFilteredDesc') : t('emptyDesc')}
            />
          ) : (
            <div className="wf-card-grid inspiration-grid">
              {bundle.rows.map((row) => (
                <InspirationCard
                  key={row.id}
                  row={row}
                  active={row.id === bundle.activeId}
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
