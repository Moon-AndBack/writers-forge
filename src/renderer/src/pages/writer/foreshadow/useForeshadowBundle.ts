/**
 * 伏笔透传包 hook：在 `useForeshadowWorkspace` 之上组装 `ForeshadowBundle`，
 * 并把「点卡选中 → 右栏隐藏时自动展开」收进 `onSelect`（右栏显隐真源在页面层）。
 *
 * 仅活动模块为 `foreshadow` 时返回非空包；其余模块返回 null，中 / 右栏不挂载。
 */
import { useCallback, useMemo } from 'react'
import type { WriterModule } from '../../../shell/activityBarModules'
import type { ForeshadowBundle } from './foreshadowTree'
import { useForeshadowWorkspace } from './useForeshadowWorkspace'

export function useForeshadowBundle(
  module: WriterModule,
  bookId: string,
  rightPaneHidden: boolean,
  showRightPane: () => void
): ForeshadowBundle | null {
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

  const handleSelect = useCallback(
    (id: number): void => {
      select(id)
      if (rightPaneHidden) showRightPane()
    },
    [select, rightPaneHidden, showRightPane]
  )

  return useMemo<ForeshadowBundle | null>(() => {
    if (!enabled) return null
    return {
      bookId,
      rows,
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
