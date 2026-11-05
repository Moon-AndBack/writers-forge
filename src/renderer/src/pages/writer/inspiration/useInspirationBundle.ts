/**
 * 灵感模块装配 hook：列表加载（按标签筛选）+ 选中 + 增删改 + 右栏草稿脏态 / 切换守卫。
 *
 * 口径与伏笔（`useForeshadowWorkspace`）/ 设定档案一致：
 * - 列表态按 `bookId + 筛选标签` 打标，派生时标记不一致即视为加载中，换书 / 切筛选不闪旧数据；
 * - 选中为派生值：显式选中项仍在当前列表中则用之，否则回退首行（删除 / 筛选后自动回退）；
 * - 右栏只改本地草稿，点保存才落库；切条目 / 切筛选有脏则挂起两态确认（`guardSwitch` /
 *   `resolveSwitch`）；切模块 / 换书时右栏卸载前自动保存兜底（`saveRef` 不随表单注销）。
 *
 * 仅活动模块为 `inspiration` 时发起 IPC（`enabled`），其余模块返回 null、视图不挂载。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { WriterModule } from '../../../shell/activityBarModules'
import { useUnsavedGuard } from '../../../shell/useUnsavedGuard'
import type { InspirationBundle, InspirationRow, InspirationUpdatePatch } from './inspirationTree'

/** 灵感域装配日志（转发至主进程落盘）。 */
const log = createLogger('inspiration')

/** 稳定空数组（避免每次渲染新建引用）。 */
const EMPTY_ROWS: InspirationRow[] = []
const EMPTY_TAGS: string[] = []

/** 一次查询的结果：当前筛选下的行 + 全书去重标签。 */
interface InspirationQueryResult {
  rows: InspirationRow[]
  tags: string[]
}

/** 列表态：带书 / 筛选标签标记，派生时仅标记一致才采用。 */
interface InspirationRowsState {
  bookId: string
  tag: string | null
  rows: InspirationRow[]
}

/** 标签态：仅采用当前书的标签集合。 */
interface InspirationTagsState {
  bookId: string | null
  tags: string[]
}

export function useInspirationBundle(
  module: WriterModule,
  bookId: string,
  rightPaneHidden: boolean,
  showRightPane: () => void
): InspirationBundle | null {
  const enabled = module === 'inspiration'

  const [rowsState, setRowsState] = useState<InspirationRowsState>({
    bookId: '',
    tag: null,
    rows: EMPTY_ROWS
  })
  const [tagsState, setTagsState] = useState<InspirationTagsState>({
    bookId: null,
    tags: EMPTY_TAGS
  })
  /** 当前筛选标签（null = 全部）。 */
  const [activeTag, setActiveTagState] = useState<string | null>(null)
  /** 显式选中项 id（null = 尚未选择 → 派生回退首行）。 */
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // 未保存改动（右栏表单上报）。
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  // 保存入口：右栏表单挂载时写入（切换确认「保存」/ 关闭前 flush 据此落库）。
  const saveRef = useRef<(() => void | Promise<boolean>) | null>(null)
  // 草稿重置键：放弃时递增，右栏表单以它为 key 重挂、草稿回退到行值。
  const [draftResetKey, setDraftResetKey] = useState(0)

  const rowsMatch = enabled && rowsState.bookId === bookId && rowsState.tag === activeTag
  const rows = rowsMatch ? rowsState.rows : EMPTY_ROWS
  const tags = enabled && tagsState.bookId === bookId ? tagsState.tags : EMPTY_TAGS
  const loading = enabled && bookId !== '' && !rowsMatch

  // 选中口径（派生）：显式选中项仍在列表中则用之，否则回退首行。
  const activeId =
    selectedId !== null && rows.some((row) => row.id === selectedId)
      ? selectedId
      : (rows[0]?.id ?? null)
  const activeRow = rows.find((row) => row.id === activeId) ?? null

  /** 并行拉取「筛选列表 + 全书标签」（两个 IPC 互不阻塞）。 */
  const query = useCallback(
    async (tag: string | null): Promise<InspirationQueryResult> => {
      const [nextRows, nextTags] = await Promise.all([
        window.api.inspiration.list(bookId, tag ?? undefined),
        window.api.inspiration.tags(bookId)
      ])
      return { rows: nextRows, tags: nextTags }
    },
    [bookId]
  )

  /** 落列查询结果；当前筛选标签已不存在（标签被删空）时回退「全部」。 */
  const applyQuery = useCallback(
    (tag: string | null, data: InspirationQueryResult): void => {
      setRowsState({ bookId, tag, rows: data.rows })
      setTagsState({ bookId, tags: data.tags })
      if (tag !== null && !data.tags.includes(tag)) setActiveTagState(null)
    },
    [bookId]
  )

  // 切模块 / 换书 / 切筛选：拉取当前筛选下的列表并打标（派生侧按标记自然置空）。
  useEffect(() => {
    if (!enabled || bookId === '') return undefined
    let cancelled = false
    void query(activeTag)
      .then((data) => {
        if (!cancelled) applyQuery(activeTag, data)
      })
      .catch((error) => {
        log.warn('灵感列表加载失败', error)
        if (!cancelled) setRowsState({ bookId, tag: activeTag, rows: EMPTY_ROWS })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, bookId, activeTag, query, applyQuery])

  /** 重新拉取列表与标签（新建 / 删除后调用）；`selectFirst` = 选中刷新后首条。 */
  const reload = useCallback(
    async (selectFirst = false): Promise<void> => {
      if (!enabled || bookId === '') return
      try {
        const data = await query(activeTag)
        applyQuery(activeTag, data)
        if (selectFirst) setSelectedId(data.rows[0]?.id ?? null)
      } catch (error) {
        log.warn('灵感列表刷新失败', error)
      }
    },
    [enabled, bookId, activeTag, query, applyQuery]
  )

  /** 仅刷新标签集合（写操作后同步筛选下拉）；当前筛选标签消失则回退「全部」。 */
  const refreshTags = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.inspiration.tags(bookId)
      setTagsState({ bookId, tags: next })
      if (activeTag !== null && !next.includes(activeTag)) setActiveTagState(null)
    } catch (error) {
      log.warn('灵感标签加载失败', error)
    }
  }, [bookId, activeTag])

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

  /** 切换筛选：有未保存草稿时挂起两态确认（筛选会切走当前选中行）。 */
  const changeFilter = useCallback(
    (tag: string | null): void => {
      if (tag === activeTag) return
      guard(() => setActiveTagState(tag))
    },
    [activeTag, guard]
  )

  /** 新建空白灵感：清筛选确保新行可见，并立即选中它。 */
  const create = useCallback(async (): Promise<boolean> => {
    if (!enabled || bookId === '') return false
    try {
      const created = await window.api.inspiration.create(bookId)
      if (!created) return false
      setActiveTagState(null)
      setSelectedId(created.id)
      const data = await query(null)
      applyQuery(null, data)
      return true
    } catch (error) {
      log.warn('新建灵感失败', error)
      return false
    }
  }, [enabled, bookId, query, applyQuery])

  const update = useCallback(
    async (id: number, patch: InspirationUpdatePatch): Promise<boolean> => {
      try {
        const updated = await window.api.inspiration.update(id, patch)
        if (!updated) return false
        setRowsState((prev) => {
          if (prev.bookId !== bookId || prev.tag !== activeTag) return prev
          // 当前筛选下标签已不再匹配：按 `list(bookId, tag)` 口径移出列表。
          if (activeTag !== null && !updated.tags.includes(activeTag)) {
            return { ...prev, rows: prev.rows.filter((row) => row.id !== id) }
          }
          return { ...prev, rows: prev.rows.map((row) => (row.id === id ? updated : row)) }
        })
        // 标签集合可能变化：同步下拉选项（异步，不阻塞保存返回）。
        void refreshTags()
        return true
      } catch (error) {
        log.warn('灵感保存失败', error)
        return false
      }
    },
    [bookId, activeTag, refreshTags]
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
      activeTag,
      tags,
      rows,
      activeId,
      activeRow,
      loading,
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
      onFilterChange: changeFilter,
      onCreate: create,
      onUpdate: update,
      onDelete: remove,
      reload
    }
  }, [
    enabled,
    bookId,
    activeTag,
    tags,
    rows,
    activeId,
    activeRow,
    loading,
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
    changeFilter,
    create,
    update,
    remove,
    reload
  ])
}
