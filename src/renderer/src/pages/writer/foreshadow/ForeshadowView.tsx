/**
 * 伏笔中栏视图：标题栏「新建」动作 + 伏笔列表（单卡见 `ForeshadowItem`）。
 *
 * - 空态文案取 `foreshadow` ns 的 `emptyTitle` / `emptyDesc`（提示正文右键创建）；
 * - 手动新建走标题栏加号（未锚定伏笔，复用 `ForeshadowCreateDialog`）；
 * - 选中 / 详情编辑在右栏（`ForeshadowPanel`），中栏只做列表；
 * - 删除入口只在卡片上（二次确认在本视图持有 `deleteId`），右栏详情不再重复提供。
 */
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readGridCardWidth } from '../../../components/cardGridMetrics'
import { useStableMeasure } from '../../../components/useStableMeasure'
import ForeshadowCreateDialog from '../../../components/dialogs/ForeshadowCreateDialog'
import { EmptyState } from '../../../components/EmptyState'
import { LoadErrorState } from '../../../components/LoadErrorState'
import { useToast } from '../../../components/ui'
import ConfirmDialog from '../ConfirmDialog'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import ForeshadowActivityActions from './ForeshadowActivityActions'
import ForeshadowItem from './ForeshadowItem'
import ForeshadowTrashView from './ForeshadowTrashView'
import { useForeshadowEntityMatches } from './useForeshadowEntityMatches'
import type { ForeshadowEntityChip } from './useForeshadowEntityMatches'
import type { ForeshadowBundle } from './foreshadowTree'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import type { OutlineItemRow } from '../outline/outlineTree'

/** 手动新建的锚点：未锚定（主流程的正文右键会带真实锚点快照）。 */
const UNANCHORED = { kind: 'none' } as const

/** 无相关实体时的恒等空数组（引用稳定，避免卡片按长度签名做无谓重测）。 */
const EMPTY_ENTITIES: readonly ForeshadowEntityChip[] = []

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
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  /** 中栏是否显示回收站（与章节 / 大纲同型：标题栏按钮切换，替代列表区）。 */
  const [trashOpen, setTrashOpen] = useState(false)
  // 相关实体：列表层批量匹配（四段文本 → 去重胶囊），卡片只接收本行结果。
  const entityMatches = useForeshadowEntityMatches(bundle.bookId, bundle.rows)
  // 卡片网格：布局签名（单卡内容可用宽）供实体胶囊行容量重测。
  const gridRef = useRef<HTMLDivElement | null>(null)
  const layoutKey = useStableMeasure(gridRef, bundle.rows.length > 0, readGridCardWidth)
  // 实体悬停卡：整张网格只挂一个 `HoverCard`，胶囊经事件委托（`closest`）定位。
  const entityHover = useEntityHover()

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

  const handleToggleTrash = useCallback((): void => setTrashOpen((open) => !open), [])

  /** 还原 / 彻底删除 / 清空后刷新全书列表（选中项自动回退）。 */
  const handleTrashChanged = useCallback((): void => {
    void bundle.reload()
  }, [bundle])

  // 有未保存草稿时先挂起（新建会切走当前详情，交右栏两态确认后再开弹窗）。
  const handleCreate = useCallback((): void => {
    // 新建落在列表视图：回收站打开时先切回列表。
    setTrashOpen(false)
    bundle.guardSwitch(() => setCreateOpen(true))
  }, [bundle])

  const handleCreated = useCallback((): void => {
    setCreateOpen(false)
    showToast(t('toast.createSuccess'))
    // 列表按 `updated_at DESC` 排序，新建行即首条；刷新后选中它。
    void bundle.reload(true)
  }, [bundle, showToast, t])

  const handleFailed = useCallback((): void => {
    showToast(t('toast.createFailed'))
  }, [showToast, t])

  return (
    <>
      <ForeshadowActivityActions
        onCreate={handleCreate}
        onToggleTrash={handleToggleTrash}
        trashOpen={trashOpen}
      />

      {trashOpen ? (
        <ForeshadowTrashView bookId={bundle.bookId} onChanged={handleTrashChanged} />
      ) : (
        <div className="editor-scroll">
          <div className="editor-inner is-full">
            {bundle.loadError && bundle.rows.length === 0 ? (
              /* 读取失败且无可用数据：与「真的是空列表」区分，给出重试入口。 */
              <LoadErrorState onRetry={() => void bundle.reload()} />
            ) : bundle.loading && bundle.rows.length === 0 ? (
              <div className="foreshadow-loading">{tCommon('loading')}</div>
            ) : bundle.rows.length === 0 ? (
              <EmptyState title={t('emptyTitle')} description={t('emptyDesc')} />
            ) : (
              <div
                className="wf-card-grid foreshadow-grid"
                ref={gridRef}
                onMouseOver={entityHover.onMouseOver}
                onMouseLeave={entityHover.onMouseLeave}
              >
                {bundle.rows.map((row) => (
                  <ForeshadowItem
                    key={row.id}
                    row={row}
                    active={row.id === bundle.activeId}
                    chapters={chapters}
                    volumes={volumes}
                    outlineItems={outlineItems}
                    entities={entityMatches.get(row.id) ?? EMPTY_ENTITIES}
                    layoutKey={layoutKey}
                    entityHover={entityHover}
                    onSelect={bundle.onSelect}
                    onDelete={setDeleteId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {createOpen ? (
        <ForeshadowCreateDialog
          bookId={bundle.bookId}
          anchor={UNANCHORED}
          defaultTitle=""
          contextLabel=""
          selectedText=""
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          onFailed={handleFailed}
        />
      ) : null}

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

      {/* 实体悬停卡：全列表共用（数据走 `entities.get`，经 LRU 缓存）。 */}
      <HoverCard
        anchor={entityHover.anchor}
        onClose={entityHover.close}
        onPointerEnter={entityHover.cancelHide}
        onPointerLeave={entityHover.onMouseLeave}
      />
    </>
  )
}
