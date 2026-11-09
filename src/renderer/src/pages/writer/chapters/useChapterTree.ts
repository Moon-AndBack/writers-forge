import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import { notifyTrashChanged } from '../trashRefresh'
import type { ChapterPin, ChapterRow, ChapterStatus, RenameChapterPatch } from './chapterTree'

/** 章节树加载 / 状态变更日志（转发至主进程落盘）。 */
const log = createLogger('useChapterTree')

/**
 * 创建章入参（`volumeId` 必填；特殊章须 `specialPrefix` + 名段）。
 * `isSpecial` 为 **IPC 过渡入参**：`chapters:create` 内部将其映射为数据层 `kind`，
 * 与 preload `Api` 的 `CreateChapterInput` 签名兼容（多余字段在变量传参时不触发校验）。
 */
export interface CreateChapterInput {
  volumeId: number
  /** 名段（右框）。 */
  title?: string
  /** 特殊章前段（左框）。特殊章必填。 */
  specialPrefix?: string | null
  /** 特殊章标记（映射数据层 `kind='special'`）。 */
  isSpecial?: boolean
  /** 特殊章置顶 / 置底；普通章忽略（恒 null）。 */
  pin?: ChapterPin
}

/** 章节树数据态（卷读写已剥离至共享卷源 `volumes/useVolumes`，本 hook 仅管章）。 */
export interface ChapterTree {
  /** 未删除章（后端顺序：按卷分组、组内 pin 段序）。 */
  chapters: ChapterRow[]
  /** 是否仍在首次加载。 */
  loading: boolean
  /** 重新拉取章（写操作后调用）。 */
  reload: () => Promise<void>
  /** 改章节状态（两态），成功后就地更新 `chapters`（无需整树重取）。 */
  setStatus: (id: number, status: ChapterStatus) => Promise<void>
  /** 改章节名 / 属性（字段直映射），成功后就地更新 `chapters`（写操作串行化）。 */
  renameChapter: (id: number, patch: RenameChapterPatch) => Promise<void>
  /** 在指定卷下新建章（v2：volumeId 必填），成功返回新章。 */
  createChapter: (input: CreateChapterInput) => Promise<ChapterRow | null>
  /** 软删除章。 */
  deleteChapter: (id: number) => Promise<void>
  /** 特殊章置顶 / 置底（仅特殊章），成功后就地更新该行。 */
  setChapterPin: (id: number, pin: ChapterPin) => Promise<void>
  /**
   * 同卷同 pin 段内重排章（`targetIndex` = 段内 splice 位置，0 起）。
   * 成功后 reload（后端整组重写 sort_order / 动态编号随卷序变化）。
   */
  reorderChapter: (id: number, targetIndex: number) => Promise<boolean>
  /**
   * 跨卷移动章（追加到目标卷末尾，源 / 目标两组重排）。
   * 数据层拦截分组容器 / 特殊章 → 自定义卷；成功后 reload。
   */
  moveChapter: (id: number, volumeId: number) => Promise<boolean>
}

/**
 * 章节树数据源：`api.chapters.list` 驱动（卷读写见共享卷源）。
 *
 * 读：挂载 / `bookId` 变化时拉取；无 Electron API 或空 bookId 时置空。
 * 写：`setStatus` / `renameChapter` / `setChapterPin` 就地更新行；
 *     增删 / 重排 / 跨卷移动等结构写成功后 reload 刷新（`createChapter` 返回新行供选中）。
 */
export function useChapterTree(bookId: string): ChapterTree {
  const [chapters, setChapters] = useState<ChapterRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (): Promise<void> => {
    const api = window.api?.chapters
    if (!api || bookId === '') {
      setChapters([])
      setLoading(false)
      return
    }
    try {
      setChapters(await api.list(bookId))
    } catch (error) {
      log.warn('章节树加载失败', error)
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    let active = true
    void (async () => {
      const api = window.api?.chapters
      if (!api || bookId === '') {
        if (active) {
          setChapters([])
          setLoading(false)
        }
        return
      }
      try {
        const next = await api.list(bookId)
        if (active) setChapters(next)
      } catch (error) {
        log.warn('章节树加载失败', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId])

  const setStatus = useCallback(async (id: number, status: ChapterStatus): Promise<void> => {
    const api = window.api?.chapters
    if (!api) return
    try {
      const updated = await api.setStatus(id, status)
      if (updated) {
        setChapters((prev) => prev.map((row) => (row.id === id ? updated : row)))
      }
    } catch (error) {
      log.warn('章节状态更新失败', error)
    }
  }, [])

  // 写操作串行化：编辑头「失焦提交」等可能先后触发，
  // 用 promise 链保证 rename 落库顺序，防止后发的旧名覆盖先发的新名。
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  const renameChapter = useCallback(
    async (id: number, patch: RenameChapterPatch): Promise<void> => {
      const api = window.api?.chapters
      if (!api) return
      writeChainRef.current = writeChainRef.current.then(async () => {
        try {
          const updated = await api.rename(id, patch)
          if (updated) {
            setChapters((prev) => prev.map((row) => (row.id === id ? updated : row)))
          }
        } catch (error) {
          log.warn('章节重命名失败', error)
        }
      })
      return writeChainRef.current
    },
    []
  )

  const createChapter = useCallback(
    async (input: CreateChapterInput): Promise<ChapterRow | null> => {
      const api = window.api?.chapters
      if (!api || bookId === '') return null
      try {
        const created = await api.create(bookId, input)
        await reload()
        return created
      } catch (error) {
        log.warn('新建章失败', error)
        return null
      }
    },
    [bookId, reload]
  )

  const deleteChapter = useCallback(
    async (id: number): Promise<void> => {
      const api = window.api?.chapters
      if (!api) return
      try {
        const ok = await api.delete(id)
        if (!ok) return
        await reload()
        // 回收站可能正打开：通知其重新拉取（视图条件挂载，自身不会感知本次删除）。
        notifyTrashChanged()
      } catch (error) {
        log.warn('删除章失败', error)
      }
    },
    [reload]
  )

  const setChapterPin = useCallback(
    async (id: number, pin: ChapterPin): Promise<void> => {
      const api = window.api?.chapters
      if (!api) return
      try {
        const updated = await api.setPin(id, pin)
        if (updated) {
          // pin 变化会改变组内展示顺序（pin 段位移），就地替换后仍需 reload 校正排序。
          setChapters((prev) => prev.map((row) => (row.id === id ? updated : row)))
          await reload()
        }
      } catch (error) {
        log.warn('设置章节置顶/置底失败', error)
      }
    },
    [reload]
  )

  const reorderChapter = useCallback(
    async (id: number, targetIndex: number): Promise<boolean> => {
      const api = window.api?.chapters
      if (!api) return false
      try {
        const ok = await api.reorder(id, targetIndex)
        if (ok) await reload()
        return ok
      } catch (error) {
        log.warn('章节重排失败', error)
        return false
      }
    },
    [reload]
  )

  const moveChapter = useCallback(
    async (id: number, volumeId: number): Promise<boolean> => {
      const api = window.api?.chapters
      if (!api) return false
      try {
        const ok = await api.move(id, volumeId)
        if (ok) await reload()
        return ok
      } catch (error) {
        log.warn('章节跨卷移动失败', error)
        return false
      }
    },
    [reload]
  )

  return {
    chapters,
    loading,
    reload,
    setStatus,
    renameChapter,
    createChapter,
    deleteChapter,
    setChapterPin,
    reorderChapter,
    moveChapter
  }
}
