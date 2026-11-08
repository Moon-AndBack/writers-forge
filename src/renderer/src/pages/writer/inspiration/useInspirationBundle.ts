/**
 * 灵感模块装配 hook：全书列表加载 + 本地筛选 + 选中 + 增删改 + 右栏草稿脏态 / 切换守卫。
 *
 * 筛选口径与设定档案五域一致：
 * - 列表**一次拉全书**（`inspiration.list(bookId)`，不带标签），筛选 / 搜索在渲染层
 *   用纯函数 `filterInspirationRows` 本地派生；
 * - 条件真源在外壳层 `InspirationFilterProvider`（活动栏浮层写入），本 hook 只读；
 * - 列表态按 `bookId` 打标，派生时标记不一致即视为加载中，换书不闪旧数据；
 * - **选中为派生值且按全量 `allRows` 计算**：筛选 / 搜索不改变选中项（对齐实体五域）；
 * - 右栏只改本地草稿，点保存才落库；切条目有脏则挂起两态确认（`guardSwitch` /
 *   `resolveSwitch`）；切模块 / 换书时右栏卸载前自动保存兜底（`saveRef` 不随表单注销）。
 *
 * 仅活动模块为 `inspiration` 时发起 IPC（`enabled`），其余模块返回 null、视图不挂载。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import { notifyTrashChanged } from '../trashRefresh'
import type { WriterModule } from '../../../shell/activityBarModules'
import { useUnsavedGuard } from '../../../shell/useUnsavedGuard'
import { useInspirationFilters } from './inspirationFilterContext'
import { filterInspirationRows } from './inspirationFilterMatch'
import type { InspirationBundle, InspirationRow, InspirationUpdatePatch } from './inspirationTree'

/** 灵感域装配日志（转发至主进程落盘）。 */
const log = createLogger('inspiration')

/** 稳定空数组（避免每次渲染新建引用）。 */
const EMPTY_ROWS: InspirationRow[] = []

/** 列表态：带书标记，派生时仅标记一致才采用。 */
interface InspirationRowsState {
  bookId: string
  rows: InspirationRow[]
}

export function useInspirationBundle(
  module: WriterModule,
  bookId: string,
  rightPaneHidden: boolean,
  showRightPane: () => void
): InspirationBundle | null {
  const enabled = module === 'inspiration'
  const { filters, clearAll: clearInspirationFilters, refreshTags } = useInspirationFilters()

  const [rowsState, setRowsState] = useState<InspirationRowsState>({
    bookId: '',
    rows: EMPTY_ROWS
  })
  // 读取失败标记（按书打标：换书即失效，不把上一本的失败带到当前书）。
  const [loadErrorState, setLoadErrorState] = useState<{ bookId: string; failed: boolean }>({
    bookId: '',
    failed: false
  })
  /** 显式选中项 id（null = 尚未选择 → 派生回退首行）。 */
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // 未保存改动（右栏表单上报）。
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  // 保存入口：右栏表单挂载时写入（切换确认「保存」/ 关闭前 flush 据此落库）。
  const saveRef = useRef<(() => void | Promise<boolean>) | null>(null)
  // 草稿重置键：放弃时递增，右栏表单以它为 key 重挂、草稿回退到行值。
  const [draftResetKey, setDraftResetKey] = useState(0)

  const rowsMatch = enabled && rowsState.bookId === bookId
  const allRows = rowsMatch ? rowsState.rows : EMPTY_ROWS
  // 筛选 / 搜索只影响网格可见行；全量 `allRows` 留给选中派生与写操作。
  const rows = useMemo(
    () => filterInspirationRows(allRows, filters.tag, filters.query),
    [allRows, filters]
  )
  const loading = enabled && bookId !== '' && !rowsMatch
  const loadError = enabled && loadErrorState.bookId === bookId && loadErrorState.failed

  /** 拉取全书列表（本地筛选前的全量）；加载 effect 与新建 / 删除后的 reload 共用。 */
  const fetchRows = useCallback(
    async (): Promise<InspirationRow[]> => window.api.inspiration.list(bookId),
    [bookId]
  )

  // 选中口径（派生）：显式选中项仍在全量列表中则用之，否则回退全量首行。
  // 筛选 / 搜索不改变选中项（与实体五域一致）；被筛掉的行仍可在右栏继续编辑。
  const activeId =
    selectedId !== null && allRows.some((row) => row.id === selectedId)
      ? selectedId
      : (allRows[0]?.id ?? null)
  const activeRow = allRows.find((row) => row.id === activeId) ?? null

  /** 拉取全书列表（本地筛选前）；新建 / 删除后同样复用。 */
  const reload = useCallback(
    async (selectFirst = false): Promise<void> => {
      if (!enabled || bookId === '') return
      try {
        const nextRows = await fetchRows()
        setRowsState({ bookId, rows: nextRows })
        setLoadErrorState({ bookId, failed: false })
        if (selectFirst) setSelectedId(nextRows[0]?.id ?? null)
      } catch (error) {
        log.warn('灵感列表加载失败', error)
        setRowsState({ bookId, rows: EMPTY_ROWS })
        // 重试仍失败：保持错误态（列表为空时显示「加载失败 + 重试」）。
        setLoadErrorState({ bookId, failed: true })
      }
    },
    [enabled, bookId, fetchRows]
  )

  // 切模块 / 换书：拉取全书列表并打标（派生侧按标记自然置空）。
  useEffect(() => {
    if (!enabled || bookId === '') return undefined
    let cancelled = false
    void fetchRows()
      .then((nextRows) => {
        if (cancelled) return
        setRowsState({ bookId, rows: nextRows })
        setLoadErrorState({ bookId, failed: false })
      })
      .catch((error) => {
        log.warn('灵感列表加载失败', error)
        if (cancelled) return
        setRowsState({ bookId, rows: EMPTY_ROWS })
        setLoadErrorState({ bookId, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, bookId, fetchRows])

  const reportDirty = useCallback((next: boolean): void => {
    dirtyRef.current = next
    setDirty(next)
  }, [])

  /** 无条件落库：无改动也应成功；无保存入口（表单未挂载）按失败处理，不假报成功。 */
  const save = useCallback(async (): Promise<boolean> => {
    const saveNow = saveRef.current
    if (!saveNow) return false
    try {
      const result = saveNow()
      // 表单无改动时 `saveNow` 直接返回 undefined（无写入）：视为成功。
      if (result === undefined) return true
      return (await result) !== false
    } catch (error) {
      log.warn('保存灵感草稿失败', error)
      return false
    }
  }, [])

  /** 放弃当前草稿：先清脏，再递增重置键让右栏表单回退到行值。 */
  const discardDraft = useCallback((): void => {
    reportDirty(false)
    setDraftResetKey((key) => key + 1)
  }, [reportDirty])

  const { guard, pending, confirming, resolve, flush, clearPending } = useUnsavedGuard({
    dirty,
    save,
    discard: discardDraft
  })

  /**
   * 切模块 / 换书 / 离开写作页：右栏详情是条件挂载，脏草稿会随卸载丢失——
   * 在本次装配失效的清理阶段先自动保存兜底。`saveRef` 不随表单卸载注销，
   * 此处仍能取到最后一笔草稿；清脏避免重复回写。
   */
  useEffect(() => {
    return () => {
      clearPending()
      if (dirtyRef.current) void flush()
      reportDirty(false)
    }
  }, [enabled, bookId, clearPending, flush, reportDirty])

  const select = useCallback(
    (id: number): void => {
      if (id === activeId) return
      guard(() => setSelectedId(id))
    },
    [activeId, guard]
  )

  /** 新建空白灵感：清筛选（含关键词）确保新行可见，并立即选中它。 */
  const create = useCallback(async (): Promise<boolean> => {
    if (!enabled || bookId === '') return false
    try {
      const created = await window.api.inspiration.create(bookId)
      if (!created) return false
      clearInspirationFilters()
      setSelectedId(created.id)
      await reload()
      return true
    } catch (error) {
      log.warn('新建灵感失败', error)
      return false
    }
  }, [enabled, bookId, clearInspirationFilters, reload])

  const update = useCallback(
    async (id: number, patch: InspirationUpdatePatch): Promise<boolean> => {
      try {
        const updated = await window.api.inspiration.update(id, patch)
        if (!updated) return false
        setRowsState((prev) =>
          prev.bookId === bookId
            ? { ...prev, rows: prev.rows.map((row) => (row.id === id ? updated : row)) }
            : prev
        )
        // 标签集合可能变化：同步活动栏浮层的分类选项（异步，不阻塞保存返回）。
        void refreshTags()
        return true
      } catch (error) {
        log.warn('灵感保存失败', error)
        return false
      }
    },
    [bookId, refreshTags]
  )

  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const ok = await window.api.inspiration.delete(id)
        if (!ok) return false
        setRowsState((prev) =>
          prev.bookId === bookId
            ? { ...prev, rows: prev.rows.filter((row) => row.id !== id) }
            : prev
        )
        setSelectedId((prev) => (prev === id ? null : prev))
        void refreshTags()
        // 回收站可能正打开：通知其重新拉取。
        notifyTrashChanged()
        return true
      } catch (error) {
        log.warn('灵感删除失败', error)
        return false
      }
    },
    [bookId, refreshTags]
  )

  const handleSelect = useCallback(
    (id: number): void => {
      select(id)
      if (rightPaneHidden) showRightPane()
    },
    [select, rightPaneHidden, showRightPane]
  )

  return useMemo<InspirationBundle | null>(() => {
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
      saveDraft: flush,
      discardDraft,
      draftResetKey,
      switchPending: pending,
      onResolveSwitch: resolve,
      guardSwitch: guard,
      confirming,
      onSelect: handleSelect,
      onCreate: create,
      onUpdate: update,
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
    flush,
    discardDraft,
    draftResetKey,
    pending,
    resolve,
    guard,
    confirming,
    handleSelect,
    create,
    update,
    remove,
    reload
  ])
}
