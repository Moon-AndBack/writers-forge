import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch
} from './plotTree'

/** 剧情树加载 / 写操作日志（转发至主进程落盘）。 */
const log = createLogger('plot')

/** 剧情树数据态。 */
export interface PlotTree {
  /** 未删除剧情线（后端顺序：`sortOrder, id`）。 */
  lines: PlotLineRow[]
  /** 全书未删除场景（后端顺序：绝对年优先、未定年沉底，同年按 `sortOrder, id`）。 */
  scenes: PlotSceneRow[]
  /** 是否仍在首次加载。 */
  loading: boolean
  /** 最近一次加载失败信息（`null` = 正常；消费方可据此展示错误态与重试）。 */
  error: string | null
  /** 重新拉取剧情线 / 场景（写操作后调用）。 */
  reload: () => Promise<void>
  /** 新建剧情线（缺省名 →「新剧情线」；options 缺省取默认类型 + 首色），成功返回新线供选中。 */
  createLine: (name?: string, options?: CreatePlotLineOptions) => Promise<PlotLineRow | null>
  /** 重命名剧情线（`name` 须非空），写后就地更新该行（写操作串行化）。 */
  renameLine: (id: number, name: string) => Promise<void>
  /** 更新剧情线（三字段补丁，字段缺省保持不变），写后就地更新该行（写操作串行化）。 */
  updateLine: (id: number, patch: UpdatePlotLinePatch) => Promise<void>
  /** 软删除剧情线（级联软删其下场景），写后 reload。 */
  deleteLine: (id: number) => Promise<void>
  /** 在指定剧情线下新建场景（追加到末尾），成功返回新场景供选中。 */
  createScene: (lineId: number, input?: CreatePlotSceneInput) => Promise<PlotSceneRow | null>
  /** 更新场景（仅覆盖提供的字段），写后就地更新该行（写操作串行化）；返回是否落库成功。 */
  updateScene: (id: number, patch: UpdatePlotScenePatch) => Promise<boolean>
  /** 软删除场景，写后 reload。 */
  deleteScene: (id: number) => Promise<void>
}

/**
 * 剧情树数据源：`api.plot.listLines` + `api.plot.listScenes` 驱动。
 *
 * 读：挂载 / `bookId` 变化时并行拉取；无 Electron API 或空 bookId 时置空。
 * 写：`renameLine` / `updateLine` / `updateScene` 就地更新行（走写链串行化，避免编辑失焦 / 防抖
 *     保存乱序覆盖）；增删结构写成功后 reload（`createLine` / `createScene`
 *     返回新行供选中）。
 */
export function usePlotTree(bookId: string): PlotTree {
  const [lines, setLines] = useState<PlotLineRow[]>([])
  const [scenes, setScenes] = useState<PlotSceneRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const api = window.api?.plot
    if (!api || bookId === '') {
      setLines([])
      setScenes([])
      setLoadError(null)
      setLoading(false)
      return
    }
    try {
      const [nextLines, nextScenes] = await Promise.all([
        api.listLines(bookId),
        api.listScenes(bookId)
      ])
      setLines(nextLines)
      setScenes(nextScenes)
      setLoadError(null)
    } catch (error) {
      log.warn('剧情树加载失败', error)
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [bookId])

  useEffect(() => {
    let active = true
    void (async () => {
      const api = window.api?.plot
      if (!api || bookId === '') {
        if (active) {
          setLines([])
          setScenes([])
          setLoadError(null)
          setLoading(false)
        }
        return
      }
      try {
        const [nextLines, nextScenes] = await Promise.all([
          api.listLines(bookId),
          api.listScenes(bookId)
        ])
        if (active) {
          setLines(nextLines)
          setScenes(nextScenes)
          setLoadError(null)
        }
      } catch (error) {
        log.warn('剧情树加载失败', error)
        if (active) setLoadError(error instanceof Error ? error.message : String(error))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId])

  // 写操作串行化：右栏「失焦 / 防抖提交」可能先后触发，
  // 用 promise 链保证落库顺序，防止后发的旧值覆盖先发的新值。
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  const createLine = useCallback(
    async (name?: string, options?: CreatePlotLineOptions): Promise<PlotLineRow | null> => {
      const api = window.api?.plot
      if (!api || bookId === '') return null
      try {
        const created = await api.createLine(bookId, name, options)
        await reload()
        return created
      } catch (error) {
        log.warn('新建剧情线失败', error)
        return null
      }
    },
    [bookId, reload]
  )

  const renameLine = useCallback(async (id: number, name: string): Promise<void> => {
    const api = window.api?.plot
    if (!api) return
    writeChainRef.current = writeChainRef.current.then(async () => {
      try {
        const updated = await api.renameLine(id, name)
        if (updated) {
          setLines((prev) => prev.map((row) => (row.id === id ? updated : row)))
        }
      } catch (error) {
        log.warn('重命名剧情线失败', error)
      }
    })
    return writeChainRef.current
  }, [])

  const updateLine = useCallback(async (id: number, patch: UpdatePlotLinePatch): Promise<void> => {
    const api = window.api?.plot
    if (!api) return
    writeChainRef.current = writeChainRef.current.then(async () => {
      try {
        const updated = await api.updateLine(id, patch)
        if (updated) {
          setLines((prev) => prev.map((row) => (row.id === id ? updated : row)))
        }
      } catch (error) {
        log.warn('更新剧情线失败', error)
      }
    })
    return writeChainRef.current
  }, [])

  const deleteLine = useCallback(
    async (id: number): Promise<void> => {
      const api = window.api?.plot
      if (!api) return
      try {
        await api.deleteLine(id)
        await reload()
      } catch (error) {
        log.warn('删除剧情线失败', error)
      }
    },
    [reload]
  )

  const createScene = useCallback(
    async (lineId: number, input?: CreatePlotSceneInput): Promise<PlotSceneRow | null> => {
      const api = window.api?.plot
      if (!api) {
        log.warn('新建剧情场景跳过：无 Electron API', { bookId, lineId })
        return null
      }
      if (bookId === '') {
        log.warn('新建剧情场景跳过：空 bookId', { lineId })
        return null
      }
      try {
        const created = await api.createScene(bookId, lineId, input)
        if (created === null) {
          log.warn('新建剧情场景未落库（主进程守卫回 null）', { bookId, lineId })
          return null
        }
        await reload()
        return created
      } catch (error) {
        log.warn('新建剧情场景失败', error)
        return null
      }
    },
    [bookId, reload]
  )

  const updateScene = useCallback(
    async (id: number, patch: UpdatePlotScenePatch): Promise<boolean> => {
      const api = window.api?.plot
      if (!api) return false
      // 写链串行：成败写入局部标志，链尾读取（关闭前统一 flush 需据此判断「是否落库」）。
      let saved = false
      writeChainRef.current = writeChainRef.current.then(async () => {
        try {
          const updated = await api.updateScene(id, patch)
          if (updated) {
            setScenes((prev) => prev.map((row) => (row.id === id ? updated : row)))
            saved = true
          }
        } catch (error) {
          log.warn('更新剧情场景失败', error)
        }
      })
      await writeChainRef.current
      return saved
    },
    []
  )

  const deleteScene = useCallback(
    async (id: number): Promise<void> => {
      const api = window.api?.plot
      if (!api) return
      try {
        await api.deleteScene(id)
        await reload()
      } catch (error) {
        log.warn('删除剧情场景失败', error)
      }
    },
    [reload]
  )

  return {
    lines,
    scenes,
    loading,
    error: loadError,
    reload,
    createLine,
    renameLine,
    updateLine,
    deleteLine,
    createScene,
    updateScene,
    deleteScene
  }
}
