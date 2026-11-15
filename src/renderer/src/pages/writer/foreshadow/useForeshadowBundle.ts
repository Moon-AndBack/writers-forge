/**
 * 伏笔透传包 hook：在 `useForeshadowWorkspace` 之上组装 `ForeshadowBundle`，
 * 并把「点卡选中 → 右栏隐藏时自动展开」收进 `onSelect`（右栏显隐真源在页面层）。
 *
 * 仅活动模块为 `foreshadow` 时返回非空包；其余模块返回 null，中 / 右栏不挂载。
 */
import { useCallback, useMemo, useState } from 'react'
import type { WriterModule } from '../../../shell/activityBarModules'
import type { ForeshadowBundle } from './foreshadowTree'
import { useForeshadowFilters } from './foreshadowFilterContext'
import { filterForeshadowRows } from './foreshadowFilterMatch'
import { useForeshadowWorkspace } from './useForeshadowWorkspace'

/**
 * 伏笔装配包 + 富文本编辑态：正文编辑器聚焦态仅供标题栏工具栏按态显隐，
 * 不参与守卫判定（与剧情 `usePlotWorkspace` 的 `editing` 同口径）。
 *
 * 暂以交叉类型在本 hook 内补字段，避免本批扩散到 `ForeshadowBundle` 定义；
 * 右栏接入编辑器时再并入该接口。
 */
export interface ForeshadowBundleWithEditing extends ForeshadowBundle {
  /** 正文编辑器是否处于聚焦编辑（右栏上报）。 */
  editing: boolean
  /** 右栏聚焦 / 失焦上报（写回本 hook，引用稳定）。 */
  reportEditing: (editing: boolean) => void
}

export function useForeshadowBundle(
  module: WriterModule,
  bookId: string,
  rightPaneHidden: boolean,
  showRightPane: () => void
): ForeshadowBundleWithEditing | null {
  const enabled = module === 'foreshadow'
  const {
    rows,
    activeId,
    activeRow,
    loading,
    loadError,
    dirty,
    reportDirty,
    saveRef,
    saveDraft,
    discardDraft,
    draftResetKey,
    switchPending,
    resolveSwitch,
    guardSwitch,
    confirming,
    select,
    update,
    clearBodyAnchor,
    clearOutlineAnchor,
    clearRecoverAnchor,
    setAbandoned,
    remove,
    reload
  } = useForeshadowWorkspace(enabled, bookId)

  // 条件真源在渲染层共享 store（标题栏筛选行写入）；这里只读并本地派生可见行。
  // 全量 `rows` 仍供选中派生 / 写操作使用，筛选不改变右栏选中项。
  const { filters: foreshadowFilters, clearAll: clearForeshadowFilters } =
    useForeshadowFilters(bookId)
  const visibleRows = useMemo(
    () => filterForeshadowRows(rows, foreshadowFilters.status, foreshadowFilters.query),
    [rows, foreshadowFilters]
  )
  const hasFilter = foreshadowFilters.status !== null || foreshadowFilters.query.trim() !== ''

  // 正文编辑器聚焦态（右栏编辑器上报；仅供标题栏工具栏按态显隐，不参与守卫判定）。
  const [editing, setEditing] = useState(false)
  const reportEditing = useCallback((next: boolean): void => setEditing(next), [])

  const handleSelect = useCallback(
    (id: number): void => {
      select(id)
      if (rightPaneHidden) showRightPane()
    },
    [select, rightPaneHidden, showRightPane]
  )

  return useMemo<ForeshadowBundleWithEditing | null>(() => {
    if (!enabled) return null
    return {
      bookId,
      rows: visibleRows,
      hasFilter,
      clearFilters: clearForeshadowFilters,
      activeId,
      activeRow,
      loading,
      loadError,
      dirty,
      onDirtyChange: reportDirty,
      saveRef,
      saveDraft,
      discardDraft,
      draftResetKey,
      switchPending,
      onResolveSwitch: resolveSwitch,
      guardSwitch,
      confirming,
      editing,
      reportEditing,
      onSelect: handleSelect,
      onUpdate: update,
      onClearBodyAnchor: clearBodyAnchor,
      onClearOutlineAnchor: clearOutlineAnchor,
      onClearRecoverAnchor: clearRecoverAnchor,
      onSetAbandoned: setAbandoned,
      onDelete: remove,
      reload
    }
  }, [
    enabled,
    bookId,
    visibleRows,
    hasFilter,
    clearForeshadowFilters,
    activeId,
    activeRow,
    loading,
    loadError,
    dirty,
    reportDirty,
    saveRef,
    saveDraft,
    discardDraft,
    draftResetKey,
    switchPending,
    resolveSwitch,
    guardSwitch,
    confirming,
    editing,
    reportEditing,
    handleSelect,
    update,
    clearBodyAnchor,
    clearOutlineAnchor,
    clearRecoverAnchor,
    setAbandoned,
    remove,
    reload
  ])
}
