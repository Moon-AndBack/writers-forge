import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import { notifyTrashChanged } from '../trashRefresh'
import type { CreateVolumeInput, VolumeRow } from '../chapters/chapterTree'

/** 共享卷源加载 / 写操作日志（转发至主进程落盘）。 */
const log = createLogger('useVolumes')

export type { CreateVolumeInput }

/**
 * 共享卷池数据态：章节域与大纲域**共用同一份卷列表**。
 *
 * 读：`api.chapters.listVolumes(bookId)`——该接口返回章节页可见卷（`kind IN ('normal','custom')`）。
 *     大纲页另经 `outline:listVolumes` 取（含 `group`、排除 `custom`，见 `useOutlineVolumes`）；
 *     两页共用同一卷池与 `numberIndex`，故正文卷名称与顺序完全一致。
 * 写：新建 / 改名 / 删除 / 排序统一走本 hook，成功后 reload，两面板随之同步刷新。
 */
export interface VolumesStore {
  /** 未删除卷（含自定义卷；后端顺序：自定义卷置顶）。 */
  volumes: VolumeRow[]
  /** 是否仍在首次加载。 */
  loading: boolean
  /** 重新拉取卷列表（写操作后调用）。 */
  reload: () => Promise<void>
  /** 新建卷，成功返回新卷（本 hook 内已 reload）。 */
  createVolume: (input?: CreateVolumeInput) => Promise<VolumeRow | null>
  /** 重命名卷：写 `title` 名段（空白归空串）。 */
  renameVolume: (id: number, title: string) => Promise<void>
  /** 软删除卷（整卷入回收站）。 */
  deleteVolume: (id: number) => Promise<void>
  /** 卷排序（`targetIndex` 0 起），写后 reload。 */
  reorderVolume: (id: number, targetIndex: number) => Promise<boolean>
}

/**
 * 共享卷源：章节 / 大纲两域唯一的卷读写入口（`chapters:listVolumes` + `chapters:*Volume`）。
 *
 * 读：挂载 / `bookId` 变化时拉取；无 Electron API 或空 bookId 时置空。
 * 写：增删改 / 排序成功后统一 reload，保证两页写后同步可见。
 */
export function useVolumes(bookId: string): VolumesStore {
  const [volumes, setVolumes] = useState<VolumeRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async (): Promise<void> => {
    const api = window.api?.chapters
    if (!api || bookId === '') {
      setVolumes([])
      setLoading(false)
      return
    }
    try {
      setVolumes(await api.listVolumes(bookId))
    } catch (error) {
      log.warn('卷列表加载失败', error)
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
          setVolumes([])
          setLoading(false)
        }
        return
      }
      try {
        const next = await api.listVolumes(bookId)
        if (active) setVolumes(next)
      } catch (error) {
        log.warn('卷列表加载失败', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId])

  const createVolume = useCallback(
    async (input?: CreateVolumeInput): Promise<VolumeRow | null> => {
      const api = window.api?.chapters
      if (!api || bookId === '') return null
      try {
        const created = await api.createVolume(bookId, input ?? {})
        await reload()
        return created
      } catch (error) {
        log.warn('新建卷失败', error)
        return null
      }
    },
    [bookId, reload]
  )

  const renameVolume = useCallback(
    async (id: number, title: string): Promise<void> => {
      const api = window.api?.chapters
      if (!api) return
      try {
        await api.renameVolume(id, title)
        await reload()
      } catch (error) {
        log.warn('重命名卷失败', error)
      }
    },
    [reload]
  )

  const deleteVolume = useCallback(
    async (id: number): Promise<void> => {
      const api = window.api?.chapters
      if (!api) return
      try {
        const ok = await api.deleteVolume(id)
        if (!ok) return
        await reload()
        // 回收站可能正打开：通知其重新拉取（卷 + 其下章 / 条目均被软删）。
        notifyTrashChanged()
      } catch (error) {
        log.warn('删除卷失败', error)
      }
    },
    [reload]
  )

  const reorderVolume = useCallback(
    async (id: number, targetIndex: number): Promise<boolean> => {
      const api = window.api?.chapters
      if (!api) return false
      try {
        const ok = await api.reorderVolume(id, targetIndex)
        if (ok) await reload()
        return ok
      } catch (error) {
        log.warn('卷排序失败', error)
        return false
      }
    },
    [reload]
  )

  return { volumes, loading, reload, createVolume, renameVolume, deleteVolume, reorderVolume }
}
