import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { OutlineItemRow } from './outlineTree'
import type { VolumeRow } from '../chapters/chapterTree'

/** 大纲树加载 / 写操作日志（转发至主进程落盘）。 */
const log = createLogger('outline')

/**
 * 大纲树数据态（条目 CRUD；卷读写见 `useVolumes` / `useOutlineVolumes`）。
 *
 * 数据模型（新）：**分组 = `volumes.kind='group'` 的一行**（不是本 hook 的条目行）——
 * 创建 / 重命名 / 删除分组一律走卷通道（`createGroup` 返回卷行；改名 / 删名由页面层
 * 经共享卷源绑定）。其下条目 = `outline_items` 中 `volume_id = 分组 id` 的行。
 */
export interface OutlineTree {
  /** 未删除条目（`scope='entry'`：卷下 / 分组下 / 置顶独立条目）。 */
  chapters: OutlineItemRow[]
  /** 是否仍在首次加载。 */
  loading: boolean
  /** 重新拉取条目（写操作后调用）。 */
  reload: () => Promise<void>
  /** 新建条目（`title` 可空 = 纯自定义名、无编号）。
   *  `volumeId` 为 null → 置顶独立条目；为数字 → 挂到该正文卷 / 分组容器下。 */
  createChapter: (volumeId: number | null, title?: string) => Promise<OutlineItemRow | null>
  /** 新建分组容器（落一行 `volumes.kind='group'`），成功返回该分组卷行。 */
  createGroup: (title?: string) => Promise<VolumeRow | null>
  /** 重命名条目（改 title），写后就地更新该行。 */
  renameChapter: (id: number, title: string) => Promise<void>
  /** 软删除条目，写后 reload。 */
  deleteChapter: (id: number) => Promise<void>
  /** 同组内条目重排（`targetIndex` 0 起），写后 reload。 */
  reorderChapter: (id: number, targetIndex: number) => Promise<boolean>
  /** 跨卷 / 跨分组移动条目（移至目标卷末尾），写后 reload。 */
  moveChapter: (id: number, volumeId: number) => Promise<boolean>
}

/**
 * 大纲树数据源：`api.outline.list` 驱动（卷读写见 `useVolumes` / `useOutlineVolumes`）。
 *
 * 读：挂载 / `bookId` 变化时拉取；无 Electron API 或空 bookId 时置空。
 * 写：`renameChapter` 就地更新行（走写链串行化）；增删 / 重排 / 跨卷移动等
 *     结构写成功后 reload 刷新（`createChapter` 返回新行供选中）。
 */
export function useOutlineTree(bookId: string): OutlineTree {
  const [chapters, setChapters] = useState<OutlineItemRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (): Promise<void> => {
    const api = window.api?.outline
    if (!api || bookId === '') {
      setChapters([])
      setLoading(false)
      return
    }
    try {
      setChapters(await api.list(bookId))
    } catch (error) {
      log.warn('大纲树加载失败', error)
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    let active = true
    void (async () => {
      const api = window.api?.outline
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
        log.warn('大纲树加载失败', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId])

  // 写操作串行化：编辑头「失焦提交」等可能先后触发，
  // 用 promise 链保证 rename 落库顺序，防止后发的旧名覆盖先发的新名。
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  const createChapter = useCallback(
    async (volumeId: number | null, title?: string): Promise<OutlineItemRow | null> => {
      const api = window.api?.outline
      if (!api || bookId === '') return null
      try {
        const created = await api.create(bookId, volumeId, title)
        await reload()
        return created
      } catch (error) {
        log.warn('新建大纲条目失败', error)
        return null
      }
    },
    [bookId, reload]
  )

  // 新建分组容器（落卷行，无独立条目行）；成功后 reload 返回新卷行供调用方进入内联改名。
  const createGroup = useCallback(
    async (title?: string): Promise<VolumeRow | null> => {
      const api = window.api?.outline
      if (!api || bookId === '') return null
      try {
        const created = await api.createGroup(bookId, title)
        await reload()
        return created
      } catch (error) {
        log.warn('新建大纲分组失败', error)
        return null
      }
    },
    [bookId, reload]
  )

  const renameChapter = useCallback(async (id: number, title: string): Promise<void> => {
    const api = window.api?.outline
    if (!api) return
    writeChainRef.current = writeChainRef.current.then(async () => {
      try {
        const updated = await api.rename(id, title)
        if (updated) {
          setChapters((prev) => prev.map((row) => (row.id === id ? updated : row)))
        }
      } catch (error) {
        log.warn('大纲条目重命名失败', error)
      }
    })
    return writeChainRef.current
  }, [])

  const deleteChapter = useCallback(
    async (id: number): Promise<void> => {
      const api = window.api?.outline
      if (!api) return
      try {
        await api.delete(id)
        await reload()
      } catch (error) {
        log.warn('删除大纲条目失败', error)
      }
    },
    [reload]
  )

  const reorderChapter = useCallback(
    async (id: number, targetIndex: number): Promise<boolean> => {
      const api = window.api?.outline
      if (!api) return false
      try {
        const ok = await api.reorder(id, targetIndex)
        if (ok) await reload()
        return ok
      } catch (error) {
        log.warn('大纲条目重排失败', error)
        return false
      }
    },
    [reload]
  )

  const moveChapter = useCallback(
    async (id: number, volumeId: number): Promise<boolean> => {
      const api = window.api?.outline
      if (!api) return false
      try {
        const ok = await api.move(id, volumeId)
        if (ok) await reload()
        return ok
      } catch (error) {
        log.warn('大纲条目跨卷移动失败', error)
        return false
      }
    },
    [reload]
  )

  return {
    chapters,
    loading,
    reload,
    createChapter,
    createGroup,
    renameChapter,
    deleteChapter,
    reorderChapter,
    moveChapter
  }
}
