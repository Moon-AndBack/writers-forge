/**
 * 伏笔模块装配 hook：列表加载 + 选中 + 增删改 + 右栏草稿脏态 / 切换守卫。
 *
 * 口径与设定档案（`useDossierWorkspace`）/ 剧情一致：
 * - 列表状态按 `bookId` 打标，派生时仅标记一致才采用，换书 / 切模块无需手动清空；
 * - 选中为派生值：显式选中项仍在列表中则用之，否则回退首行（删除后自动回退）；
 * - 右栏只改本地草稿，点保存才落库；切条目有脏则挂起两态确认（`guardSwitch` /
 *   `resolveSwitch`）；切模块 / 换书时右栏卸载前自动保存兜底（`saveRef` 不随表单注销）。
 *
 * 仅活动模块为 `foreshadow` 时加载（`enabled`），其余模块不发起 IPC。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createLogger } from '@renderer/lib/log'
import { notifyForeshadowMarksRefresh } from '../../../components/editor/useForeshadowMarks'
import { useUnsavedGuard } from '../../../shell/useUnsavedGuard'
import type { ForeshadowRow, ForeshadowUpdatePatch } from './foreshadowTree'

/** 伏笔域装配日志（转发至主进程落盘）。 */
const log = createLogger('foreshadow')

/** 稳定空数组（避免每次渲染新建引用）。 */
const EMPTY_ROWS: ForeshadowRow[] = []

export interface ForeshadowWorkspace {
  rows: ForeshadowRow[]
  activeId: number | null
  activeRow: ForeshadowRow | null
  loading: boolean
  dirty: boolean
  reportDirty: (dirty: boolean) => void
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  saveDraft: () => Promise<boolean>
  discardDraft: () => void
  draftResetKey: number
  switchPending: boolean
  resolveSwitch: (save: boolean) => Promise<boolean>
  guardSwitch: (proceed: () => void) => void
  confirming: boolean
  select: (id: number) => void
  update: (id: number, patch: ForeshadowUpdatePatch) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
  reload: (selectFirst?: boolean) => Promise<void>
}

export function useForeshadowWorkspace(enabled: boolean, bookId: string): ForeshadowWorkspace {
  // 列表态带书标记：仅当标记与当前书一致时采用（换书自然置空，不闪上一本的数据）。
  const [rowsState, setRowsState] = useState<{ bookId: string | null; rows: ForeshadowRow[] }>({
    bookId: null,
    rows: EMPTY_ROWS
  })
  // 显式选中项 id（null = 尚未选择 → 派生回退首行）。
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // 未保存改动（右栏表单上报）。
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  // 保存入口：右栏表单挂载时写入（切换确认「保存」/ 关闭前 flush 据此落库）。
  const saveRef = useRef<(() => void | Promise<boolean>) | null>(null)
  // 草稿重置键：放弃时递增，右栏表单以它为 key 重挂、草稿回退到行值。
  const [draftResetKey, setDraftResetKey] = useState(0)

  const rows = enabled && rowsState.bookId === bookId ? rowsState.rows : EMPTY_ROWS
  const loading = enabled && bookId !== '' && rowsState.bookId !== bookId

  // 选中口径（派生）：显式选中项仍在列表中则用之，否则回退首行。
  const activeId =
    selectedId !== null && rows.some((row) => row.id === selectedId)
      ? selectedId
      : (rows[0]?.id ?? null)
  const activeRow = rows.find((row) => row.id === activeId) ?? null

  // 切模块 / 换书：拉取当前书的列表并打标（不在此处同步清空，派生侧按标记自然置空）。
  useEffect(() => {
    if (!enabled || bookId === '') return undefined
    let cancelled = false
    void (async () => {
      try {
        const next = await window.api.foreshadow.list(bookId)
        if (!cancelled) setRowsState({ bookId, rows: next })
      } catch (error) {
        log.warn('伏笔列表加载失败', error)
        if (!cancelled) setRowsState({ bookId, rows: EMPTY_ROWS })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, bookId])

  /** 重新拉取列表（新建成功后调用）；`selectFirst` = 选中刷新后首条。 */
  const reload = useCallback(
    async (selectFirst = false): Promise<void> => {
      if (!enabled || bookId === '') return
      try {
        const next = await window.api.foreshadow.list(bookId)
        setRowsState({ bookId, rows: next })
        if (selectFirst) setSelectedId(next[0]?.id ?? null)
      } catch (error) {
        log.warn('伏笔列表刷新失败', error)
      }
    },
    [enabled, bookId]
  )

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
      log.warn('保存伏笔草稿失败', error)
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

  const update = useCallback(
    async (id: number, patch: ForeshadowUpdatePatch): Promise<boolean> => {
      try {
        const updated = await window.api.foreshadow.update(id, patch)
        if (!updated) return false
        setRowsState((prev) =>
          prev.bookId === bookId
            ? { bookId, rows: prev.rows.map((row) => (row.id === id ? updated : row)) }
            : prev
        )
        // 标题变更 / 锚点快照刷新：让常驻的章节 / 大纲编辑器重拉正文标记。
        notifyForeshadowMarksRefresh()
        return true
      } catch (error) {
        log.warn('伏笔保存失败', error)
        return false
      }
    },
    [bookId]
  )

  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const ok = await window.api.foreshadow.delete(id)
        if (!ok) return false
        setRowsState((prev) =>
          prev.bookId === bookId ? { bookId, rows: prev.rows.filter((row) => row.id !== id) } : prev
        )
        setSelectedId((prev) => (prev === id ? null : prev))
        // 删除后清掉常驻编辑器里的旧标记。
        notifyForeshadowMarksRefresh()
        return true
      } catch (error) {
        log.warn('伏笔删除失败', error)
        return false
      }
    },
    [bookId]
  )

  return {
    rows,
    activeId,
    activeRow,
    loading,
    dirty,
    reportDirty,
    saveRef,
    saveDraft: flush,
    discardDraft,
    draftResetKey,
    switchPending: pending,
    resolveSwitch: resolve,
    guardSwitch: guard,
    confirming,
    select,
    update,
    remove,
    reload
  }
}
