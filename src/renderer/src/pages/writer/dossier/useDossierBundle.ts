import { useCallback, useMemo } from 'react'
import type { WriterModule } from '../../../shell/activityBar'
import type { DossierBundle } from './dossierTree'
import { useDossierWorkspace } from './useDossierWorkspace'

/**
 * 透传包 hook：在 `useDossierWorkspace` 之上组装 `DossierBundle`，
 * 并把「点卡选中 → 右栏隐藏时自动展开」收进 `onSelect`
 * （右栏显隐真源在页面层，经 `rightPaneHidden` / `showRightPane` 传入）。
 * 供 `Writer.tsx` 一行取用，避免页面层堆积装配细节。
 *
 * 批 B：脏态 / 保存入口 / 切换守卫原样透出，右栏详情与确认弹窗据此联动。
 *
 * 第 7 批自 `useDossierWorkspace.ts` 拆出（§3 单文件 ≤500 行；关系类型与入边
 * 使原文件超限），行为不变。
 */
export function useDossierBundle(
  module: WriterModule,
  bookId: string,
  rightPaneHidden: boolean,
  showRightPane: () => void
): DossierBundle | null {
  const {
    module: active,
    rows,
    activeId,
    detail,
    detailPending,
    loading,
    semanticCodes,
    incomingRelations,
    dirty,
    reportDirty,
    saveRef,
    saveDraft,
    discardDraft,
    switchPending,
    resolveSwitch,
    confirming,
    select,
    create,
    update,
    remove,
    addRelation,
    updateRelation,
    removeRelation
  } = useDossierWorkspace(module, bookId)

  const handleSelect = useCallback(
    (id: number): void => {
      select(id)
      if (rightPaneHidden) showRightPane()
    },
    [select, rightPaneHidden, showRightPane]
  )

  return useMemo<DossierBundle | null>(() => {
    if (active === null) return null
    return {
      module: active,
      bookId,
      rows,
      activeId,
      activeRow: rows.find((row) => row.id === activeId) ?? null,
      detail,
      detailPending,
      loading,
      semanticCodes,
      incomingRelations,
      dirty,
      onDirtyChange: reportDirty,
      saveRef,
      saveDraft,
      discardDraft,
      switchPending,
      onResolveSwitch: resolveSwitch,
      confirming,
      onSelect: handleSelect,
      onCreate: (input) => create(input),
      onUpdate: (id, patch) => update(id, patch),
      onDelete: (id) => {
        void remove(id)
      },
      // 关系写入一律按**调用方显式给出的实体 id** 落库（卡片编辑弹窗的目标行
      // 不一定等于右栏选中行）；返回写链 promise，供弹窗写后重拉该行关系。
      onAddRelation: (id, input) => addRelation(id, input),
      onUpdateRelation: (id, refId, patch) => updateRelation(id, refId, patch),
      onRemoveRelation: (id, refId) => removeRelation(id, refId)
    }
  }, [
    active,
    bookId,
    rows,
    activeId,
    detail,
    detailPending,
    loading,
    semanticCodes,
    incomingRelations,
    dirty,
    reportDirty,
    saveRef,
    saveDraft,
    discardDraft,
    switchPending,
    resolveSwitch,
    confirming,
    handleSelect,
    create,
    update,
    remove,
    addRelation,
    updateRelation,
    removeRelation
  ])
}
