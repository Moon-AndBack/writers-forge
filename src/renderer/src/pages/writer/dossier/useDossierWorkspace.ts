/**
 * 设定档案五域装配 hook：把「数据读写（统一走 `api.worldEntity`）+ 选中状态 +
 * 动作回调」聚合为一处，供 `Writer.tsx` 以单次调用取用、按 module 透传中 / 右栏。
 *
 * 域切换口径：hook 入参为**当前活动模块**（`WriterModule`）——非设定档案五域不加载、
 * 数据自然为空；切到某域即按 `MODULE_ENTITY_TYPE` 映射加载该域。
 * 状态一律**按域打标**（`rowsState.module` 等），派生时仅在标记与当前域一致时才采用，
 * 因此无需在 effect 里同步清空状态，也不会把上一域的行 / 详情误当作本域数据。
 * 选中口径（派生）：显式选中项仍在列表中则用之，否则回退首行；被删除后自动回退。
 * 写口径：`update` 走写链串行化（保存 / 关系增删可能先后触发，防止旧值覆盖）。
 * 保存口径（批 B 手动）：右栏只改本地草稿，点保存才落库；切换选中有脏则弹两态确认
 * （`guardSwitch` / `resolveSwitch`），切模块 / 换书时右栏卸载前自动保存兜底。
 * 关系：走统一引用通道（`listRefs` / `listIncomingRefs` / `addRef` / `updateRef` /
 * `removeRef`），详情加载时并行取回；关系类型取语义码字典（全局拉一次）。
 *
 * 本文件只做**组合**（§3 单文件 ≤500 行）：脏态 / 切换守卫见
 * `useDossierDirtyGuard`，选中 / 详情 / 关系见 `useDossierSelection`，
 * 写动作见 `useDossierMutations`。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { WriterModule } from '../../../shell/activityBar'
import { clearEntityDetailCache } from '../entities/entityDetailCache'
import {
  MODULE_ENTITY_TYPE,
  isDossierModule,
  type DossierModule,
  type DossierRow,
  type DossierWorkspace
} from './dossierTree'
import { useDossierDirtyGuard } from './useDossierDirtyGuard'
import { useDossierMutations, type DossierWriteBack } from './useDossierMutations'
import { useDossierSelection } from './useDossierSelection'

/** 设定档案装配日志（转发至主进程落盘）。 */
const log = createLogger('dossier')

/** 稳定空数组（避免每次渲染新建引用，令依赖恒等）。 */
const EMPTY_ROWS: DossierRow[] = []

export function useDossierWorkspace(module: WriterModule, bookId: string): DossierWorkspace {
  const active: DossierModule | null = isDossierModule(module) ? module : null
  const [rowsState, setRowsState] = useState<{ module: DossierModule | null; rows: DossierRow[] }>({
    module: null,
    rows: EMPTY_ROWS
  })

  // 脏态 / 保存入口 / 切换守卫（含切模块 / 换书的自动保存兜底）。
  const { dirty, reportDirty, flushDraft, saveRef, switchPending, resolveSwitch, guardSwitch } =
    useDossierDirtyGuard(active, bookId)

  const currentRows = rowsState.module === active ? rowsState.rows : EMPTY_ROWS
  // 当前域尚未拉过一次（标记不一致）即视为加载中。
  const loading = active !== null && rowsState.module !== active

  /** 拉取当前域列表。 */
  const fetchRows = useCallback(async (): Promise<DossierRow[]> => {
    if (!active || bookId === '') return EMPTY_ROWS
    const api = window.api?.worldEntity
    if (!api) return EMPTY_ROWS
    return api.list(bookId, MODULE_ENTITY_TYPE[active])
  }, [active, bookId])

  /** 重新拉取列表（写操作后调用）。 */
  const reload = useCallback(async (): Promise<void> => {
    if (!active) return
    try {
      const rows = await fetchRows()
      setRowsState({ module: active, rows })
      // 实体写（增删 / 关系增删改）都会让悬停卡过期：关系跨模块双向、无法枚举对端，整体失效。
      clearEntityDetailCache()
    } catch (error) {
      log.warn('设定档案加载失败', error)
    }
  }, [fetchRows, active])

  // 切域 / 换书：异步拉取当前域数据并打标（不在此处同步清空状态，派生侧按域标记自然置空）。
  useEffect(() => {
    if (!active || bookId === '') return undefined
    let cancelled = false
    void (async () => {
      try {
        const rows = await fetchRows()
        if (cancelled) return
        setRowsState({ module: active, rows })
      } catch (error) {
        log.warn('设定档案加载失败', error)
        if (cancelled) return
        setRowsState({ module: active, rows: EMPTY_ROWS })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [active, bookId, fetchRows])

  // 选中 / 详情 / 关系 / 语义码（详情加载与选中口径在子 hook 内）。
  const {
    activeId,
    detail,
    detailPending,
    incomingRelations,
    semanticCodes,
    select,
    api: selectionApi
  } = useDossierSelection(active, currentRows, guardSwitch)

  /** 更新成功后替换列表行（保留行上既有关系摘要）。 */
  const patchRow = useCallback((module: DossierModule, id: number, updated: DossierRow): void => {
    setRowsState((prev) =>
      prev.module === module
        ? {
            module,
            rows: prev.rows.map((row) =>
              row.id === id ? { ...updated, relations: row.relations } : row
            )
          }
        : prev
    )
  }, [])

  // 写动作不直接持 setter：先把「列表行回填 + 选中 / 详情 / 关系回填」拼成一个对象，再显式传入。
  const writeBack = useMemo<DossierWriteBack>(
    () => ({ ...selectionApi, patchRow }),
    [selectionApi, patchRow]
  )

  const { create, update, remove, deleteBySubType, addRelation, updateRelation, removeRelation } =
    useDossierMutations({ active, bookId, currentRows, reload, flushDraft, writeBack })

  // 切书时清空详情缓存：id 全库唯一不会串数据，但每条缓存含正文全文，跨书白占内存。
  useEffect(() => clearEntityDetailCache(), [bookId])

  return {
    module: active,
    bookId,
    rows: currentRows,
    activeId,
    detail,
    detailPending,
    loading,
    semanticCodes,
    incomingRelations,
    dirty,
    reportDirty,
    saveRef,
    switchPending,
    resolveSwitch,
    select,
    create,
    update,
    remove,
    deleteBySubType,
    addRelation,
    updateRelation,
    removeRelation
  }
}
