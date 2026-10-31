import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { VolumeRow } from '../chapters/chapterTree'

/** 大纲卷源加载日志（转发至主进程落盘）。 */
const log = createLogger('useOutlineVolumes')

/**
 * 卷级大纲载体行：为**承载卷纲的卷**解析其卷纲行（`scope='volume'`）——正文卷
 * （`kind='normal'`）与分组容器（`kind='group'`）均带卷纲行。
 * `id` 为卷纲行 id（`outline_items.id`），即编辑卷正文时的正文载体行 id（`contentId`）。
 */
export interface OutlineVolumeContentRef {
  volumeId: number
  /** 卷纲载体行 id（`scope='volume'`）；无卷纲行 → null。 */
  id: number | null
  /** 卷纲载体行 `updated_at`（SQLite UTC 文本）；无卷纲行 → null。供编辑头「最后编辑」。 */
  updatedAt: string | null
}

export interface OutlineVolumesStore {
  /**
   * 大纲页可见卷（`kind IN ('normal','group')`；分组容器置顶、正文卷在后；
   * 附动态 `numberIndex`）。与章节页共用同一卷池，故正文卷名称 / 顺序一致。
   */
  volumes: VolumeRow[]
  /**
   * 各**承载卷纲的卷**的卷纲载体行（`volumeId → 卷纲行 id`）。供 `EditorPane` 解析卷 /
   * 分组目标的正文载体行（`contentId`）；正文卷与分组容器均有卷纲行。
   */
  outlineVolumeRows: OutlineVolumeContentRef[]
  /** 是否仍在首次加载。 */
  loading: boolean
  /** 重新拉取卷与卷纲载体（写操作后调用）。 */
  reload: () => Promise<void>
}

/**
 * 大纲卷源：为每个承载卷纲的卷（正文卷 / 分组容器）解析其卷级大纲正文行（`outline:getVolumeOutline`）。
 *
 * 与 `volumes/useVolumes` 的分工：后者读 `chapters:listVolumes`（章节页可见卷：`normal`+`custom`，
 * 含特殊 / 自定义卷，供两页共用池的**写**入口）；本 hook 读 `outline:listVolumes`
 * （大纲页可见卷：`normal`+`group`，含分组容器、排除自定义卷），并额外解析各卷的
 * **卷纲载体行**——这是「点开卷 / 分组 → 编辑卷纲」的唯一入口，章节页不涉及。
 */
export function useOutlineVolumes(bookId: string): OutlineVolumesStore {
  const [volumes, setVolumes] = useState<VolumeRow[]>([])
  const [outlineVolumeRows, setOutlineVolumeRows] = useState<OutlineVolumeContentRef[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (): Promise<void> => {
    const api = window.api?.outline
    if (!api || bookId === '') {
      setVolumes([])
      setOutlineVolumeRows([])
      setLoading(false)
      return
    }
    try {
      const next = await api.listVolumes(bookId)
      // 为正文卷与分组容器解析卷纲载体行（两类卷均带 `scope='volume'` 卷纲行）。
      const outlineVolumes = next.filter(
        (volume) => volume.kind === 'normal' || volume.kind === 'group'
      )
      const refs = await Promise.all(
        outlineVolumes.map(async (volume): Promise<OutlineVolumeContentRef> => {
          const payload = await api.getVolumeOutline(volume.id)
          return {
            volumeId: volume.id,
            id: payload?.id ?? null,
            updatedAt: payload?.updatedAt ?? null
          }
        })
      )
      setVolumes(next)
      setOutlineVolumeRows(refs)
    } catch (error) {
      log.warn('大纲卷 / 卷纲载体加载失败', error)
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
          setVolumes([])
          setOutlineVolumeRows([])
          setLoading(false)
        }
        return
      }
      try {
        const next = await api.listVolumes(bookId)
        const outlineVolumes = next.filter(
          (volume) => volume.kind === 'normal' || volume.kind === 'group'
        )
        const refs = await Promise.all(
          outlineVolumes.map(async (volume): Promise<OutlineVolumeContentRef> => {
            const payload = await api.getVolumeOutline(volume.id)
            return {
              volumeId: volume.id,
              id: payload?.id ?? null,
              updatedAt: payload?.updatedAt ?? null
            }
          })
        )
        if (active) {
          setVolumes(next)
          setOutlineVolumeRows(refs)
        }
      } catch (error) {
        log.warn('大纲卷 / 卷纲载体加载失败', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId])

  return { volumes, outlineVolumeRows, loading, reload: load }
}
