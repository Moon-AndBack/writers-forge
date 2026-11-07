import { useCallback, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { createLogger } from '@renderer/lib/log'
import {
  scenesOfLine,
  type CreatePlotLineOptions,
  type CreatePlotSceneInput,
  type PlotLineRow,
  type PlotSceneRow
} from './plotTree'
import { usePlotTree } from './usePlotTree'
import type { UpdatePlotLinePatch, UpdatePlotScenePatch } from './plotTree'
import { useUnsavedGuard } from '../../../shell/useUnsavedGuard'

/** 剧情页装配动作日志（无线 + 缝可辨：无可用线时记 warn）。 */
const log = createLogger('plot')

/** 剧情页装配态：数据 + 选中 + 全部交互回调（供 `Writer.tsx` 直接透传三栏）。 */
export interface PlotWorkspace {
  /** 当前时间线下的未删除剧情线（后端顺序：`sortOrder, id`）。 */
  lines: PlotLineRow[]
  /** 全书未删除剧情线（不过滤时间线；右栏剧情页签据此在当前时间线内筛选）。 */
  allLines: PlotLineRow[]
  /** 全书未删除场景（用于左栏节点计数 / 右栏节点编辑 / 只读详情）。 */
  scenes: PlotSceneRow[]
  /** 当前选中剧情线 id（null = 无线）。 */
  activeLineId: number | null
  /** 当前选中剧情线（null = 无线）。 */
  activeLine: PlotLineRow | null
  /** 当前选中线下的场景（组内 `sortOrder, id` 升序）。 */
  activeScenes: PlotSceneRow[]
  /** 当前选中场景 id（null = 无线下节点）。 */
  activeSceneId: number | null
  /** 当前选中场景（null = 未选中）。 */
  activeScene: PlotSceneRow | null
  /** 当前选中场景是否有未保存改动（右栏保存按钮 + 切换守卫共用）。 */
  dirty: boolean
  /** 右栏编辑器上报脏态（表单挂载后按草稿与场景行比对调用）。 */
  reportDirty: (dirty: boolean) => void
  /** 右栏正文编辑器是否处于「编辑中」（聚焦态；供标题栏工具栏按态显隐）。 */
  editing: boolean
  /** 右栏正文编辑器聚焦态上报（聚焦 / 失焦各一次；语义对齐 `reportDirty`）。 */
  reportEditing: (editing: boolean) => void
  /** 保存入口 ref：右栏表单挂载时写入 `saveNow`（仅变更字段补丁），供切换确认「保存」/ 关闭前 flush 调用。 */
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  /**
   * 放弃当前草稿：清脏并递增 `draftResetKey`，让常驻的 `PlotEditor` 重挂、
   * 草稿回退到场景行值（只清脏不重挂会「表单持旧草稿却标记为干净」）。
   */
  discardDraft: () => void
  /** 草稿重置键：传给右栏 `PlotEditor` 的 key，递增即重挂表单并回退草稿。 */
  draftResetKey: number
  /** 是否有挂起的切换（有改动时点选 / 新建 / 删除暂缓，等两态确认）。 */
  switchPending: boolean
  /** 保存结算中：确认弹框据此禁用按钮，期间重复结算一律忽略。 */
  confirming: boolean
  /**
   * 结算挂起的切换：`save=true` 先保存草稿再切换，`false` 丢弃草稿直接切换。
   * 返回值 = 是否已执行切换：保存失败时为 `false`（不切换、不清脏，可重试）。
   */
  resolveSwitch: (save: boolean) => Promise<boolean>
  /**
   * 切换守卫（供页面层包装跨域切换：切换 / 新建时间线等本 hook 之外的选中变化）：
   * 无未保存改动立即执行；有改动则挂起该动作，等右栏两态确认后续行。
   */
  guardSwitch: (proceed: () => void) => void
  /** 选中剧情线（切换后节点选中回退到该线首个节点）。 */
  selectLine: (id: number) => void
  /**
   * 新建剧情线（三字段弹窗提交；缺省名 →「新剧情线」），返回新行并选中之；
   * 有未保存草稿时先挂起确认，挂起分支返回 null（此刻尚未创建）。
   */
  createLine: (name?: string, options?: CreatePlotLineOptions) => Promise<PlotLineRow | null>
  /** 重命名剧情线（兼容保留；编辑弹窗走 `updateLine`）。 */
  renameLine: (id: number, name: string) => void
  /** 更新剧情线（三字段补丁）。 */
  updateLine: (id: number, patch: UpdatePlotLinePatch) => void
  /** 删除剧情线（含其下场景）。 */
  deleteLine: (id: number) => void
  /** 新建场景节点（弹窗填时间 + 标题后提交；追加到当前线末尾），成功后选中新节点。 */
  addScene: (input?: CreatePlotSceneInput) => void
  /** 选中剧情场景。 */
  selectScene: (id: number) => void
  /** 保存剧情场景补丁（中栏节点弹窗的标题 / 时间即时落库；右栏正文手动保存同走本入口）。 */
  updateScene: (id: number, patch: UpdatePlotScenePatch) => Promise<boolean>
  /** 删除剧情场景。 */
  deleteScene: (id: number) => void
}

/**
 * 剧情页装配 hook：把「数据读写（`usePlotTree`）+ 选中状态 + 动作回调」聚合为一处，
 * 供 `Writer.tsx` 以单次调用取用、按需透传给左 / 中 / 右三栏。
 *
 * 选中口径（派生，非 effect）：显式选中项仍在列表中则用之，否则回退默认
 * （首条线 / 当前线首个节点），保证被删除后选中始终有效；与章节 / 大纲选中互不干扰。
 *
 * 正文口径（手动保存 + 切换守卫）：右栏编辑器只改本地草稿，点「保存」才落库（仅变更字段）；
 * 选中 / 新建 / 删除节点、切换 / 新建 / 删除剧情线前若有未保存改动，暂缓该动作并挂起
 * `switchPending`，由右栏弹两态确认后经 `resolveSwitch` 续行。
 *
 * 聚焦口径（`editing`）：右栏正文编辑器聚焦即「编辑中」、失焦即「非编辑中」，经
 * `reportEditing` 上提（仿 `reportDirty`），供标题栏工具栏按态显隐；不参与切换守卫判定。
 */
export function usePlotWorkspace(bookId: string, activeTimelineId?: string | null): PlotWorkspace {
  const {
    lines: allLines,
    scenes: allScenes,
    createLine: createPlotLine,
    renameLine: renamePlotLine,
    updateLine: updatePlotLine,
    deleteLine: deletePlotLine,
    createScene: createPlotScene,
    updateScene: updatePlotScene,
    deleteScene: deletePlotScene
  } = usePlotTree(bookId)

  // 按当前选中时间线过滤剧情线 / 场景：仅显示该时间线归属的剧情线及其下场景。
  // activeTimelineId 为空时回退全量（时间线未加载 / 无时间线兜底），避免首帧空白。
  const lines = useMemo(() => {
    if (!activeTimelineId) return allLines
    return allLines.filter((row) => row.timelineId === activeTimelineId)
  }, [allLines, activeTimelineId])
  // 场景按所属剧情线归属：仅当其剧情线属于当前时间线时才纳入；
  // 但保留全量供独立时间线视图 / 右栏按 id 解析，因此此处场景不做过滤，
  // 剧情视图场景经 `scenesOfLine(scenes, activeLineId)` 按当前线派生，已随时间线切换。
  const scenes = allScenes

  // 显式选中的剧情线 / 场景 id（null = 尚未选择）。
  const [selectedLineId, setSelectedLineId] = useState<number | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<number | null>(null)

  // 未保存改动（右栏编辑器上报）。
  const [dirty, setDirty] = useState(false)
  // 正文编辑器聚焦态（右栏编辑器上报；仅供标题栏工具栏按态显隐，不参与守卫判定）。
  const [editing, setEditing] = useState(false)
  // 保存入口：右栏表单挂载时写入（切换确认「保存」/ 关闭前 flush 据此落库当前草稿）。
  const saveRef = useRef<(() => void | Promise<boolean>) | null>(null)
  // 草稿重置键：放弃时递增，右栏 `PlotEditor` 以它为 key 重挂、草稿回退到场景行值。
  const [draftResetKey, setDraftResetKey] = useState(0)

  const reportDirty = useCallback((next: boolean): void => {
    setDirty(next)
  }, [])

  const reportEditing = useCallback((next: boolean): void => {
    setEditing(next)
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
      log.warn('保存剧情正文草稿失败', error)
      return false
    }
  }, [])

  /**
   * 放弃当前草稿：清脏 + 递增重挂键。`PlotEditor` 常驻不卸载，只清脏会让表单
   * 继续持有旧草稿却对外报净；重挂后草稿按场景行重新初始化，脏态随之归零。
   */
  const discardDraft = useCallback((): void => {
    reportDirty(false)
    setDraftResetKey((key) => key + 1)
  }, [reportDirty])

  const { guard, pending, confirming, resolve } = useUnsavedGuard({
    dirty,
    save,
    discard: discardDraft
  })
  // 对外保持原 `guardSwitch` 名称 / void 签名（`boolean` 返回值可赋给 void 签名），调用点零改动。
  const guardSwitch = guard

  const activeLineId =
    selectedLineId !== null && lines.some((row) => row.id === selectedLineId)
      ? selectedLineId
      : (lines[0]?.id ?? null)
  const activeLine = lines.find((row) => row.id === activeLineId) ?? null
  // 派生数组必须 `useMemo`：`scenesOfLine` 每次都返回新数组，直接透传给中栏会让
  // `memo(EditorPane)` 的浅比较失效（三栏拖拽逐帧重渲染时白白全量 reconcile）。
  const activeScenes = useMemo(
    () => (activeLineId === null ? [] : scenesOfLine(scenes, activeLineId)),
    [scenes, activeLineId]
  )
  const activeSceneId =
    selectedSceneId !== null && activeScenes.some((row) => row.id === selectedSceneId)
      ? selectedSceneId
      : (activeScenes[0]?.id ?? null)
  const activeScene = activeScenes.find((row) => row.id === activeSceneId) ?? null

  const selectLine = useCallback(
    (id: number): void => {
      guardSwitch(() => {
        setSelectedLineId(id)
        setSelectedSceneId(null)
      })
    },
    [guardSwitch]
  )

  const createLine = useCallback(
    (name?: string, options?: CreatePlotLineOptions): Promise<PlotLineRow | null> => {
      // 入参在本次调用的闭包里捕获：挂起后延迟执行也按点击时的值新建，不读后续状态。
      const run = async (): Promise<PlotLineRow | null> => {
        const created = await createPlotLine(name, options)
        if (created) {
          setSelectedLineId(created.id)
          setSelectedSceneId(null)
        }
        return created
      }
      // 有未保存改动时先挂起（新建会切走当前草稿，交右栏两态确认后再建）；
      // 此刻尚未创建，按「未产生新行」返回 null（调用方仅 void 调用，不消费返回值）。
      // 用容器接收挂起回调内的返回值：脏时回调不执行，容器保持 undefined。
      const started: { task?: Promise<PlotLineRow | null> } = {}
      guardSwitch(() => {
        started.task = run()
      })
      return started.task ?? Promise.resolve(null)
    },
    [guardSwitch, createPlotLine]
  )

  const renameLine = useCallback(
    (id: number, name: string): void => {
      void renamePlotLine(id, name)
    },
    [renamePlotLine]
  )

  const updateLine = useCallback(
    (id: number, patch: UpdatePlotLinePatch): void => {
      void updatePlotLine(id, patch)
    },
    [updatePlotLine]
  )

  const deleteLine = useCallback(
    (id: number): void => {
      // 有未保存改动时先挂起（删除会切走当前草稿，交右栏两态确认后再删）。
      guardSwitch(() => {
        if (selectedLineId === id) setSelectedLineId(null)
        void deletePlotLine(id)
      })
    },
    [guardSwitch, selectedLineId, deletePlotLine]
  )

  const addScene = useCallback(
    (input?: CreatePlotSceneInput): void => {
      // 有未保存改动时先挂起（切换 / 新建都会丢弃当前草稿，交右栏两态确认）。
      guardSwitch(() => {
        // activeLineId 已回退首线；仍为 null = 无可用线（无线），记 warn 可辨后返回
        //（中栏无线空态本就不渲染 + 缝，此处为调用链兜底）。
        const targetId = activeLineId ?? lines[0]?.id ?? null
        if (targetId === null) {
          log.warn('新建剧情场景跳过：无线（无可用剧情线）', { bookId })
          return
        }
        void (async () => {
          const created = await createPlotScene(targetId, input)
          if (!created) return
          setSelectedSceneId(created.id)
        })()
      })
    },
    [guardSwitch, activeLineId, lines, createPlotScene, bookId]
  )

  const selectScene = useCallback(
    (id: number): void => {
      guardSwitch(() => {
        setSelectedSceneId(id)
      })
    },
    [guardSwitch]
  )

  const updateScene = useCallback(
    (id: number, patch: UpdatePlotScenePatch): Promise<boolean> => updatePlotScene(id, patch),
    [updatePlotScene]
  )

  const deleteScene = useCallback(
    (id: number): void => {
      guardSwitch(() => {
        if (selectedSceneId === id) setSelectedSceneId(null)
        void deletePlotScene(id)
      })
    },
    [guardSwitch, selectedSceneId, deletePlotScene]
  )

  return {
    lines,
    allLines,
    scenes,
    activeLineId,
    activeLine,
    activeScenes,
    activeSceneId,
    activeScene,
    dirty,
    reportDirty,
    editing,
    reportEditing,
    saveRef,
    discardDraft,
    draftResetKey,
    switchPending: pending,
    confirming,
    resolveSwitch: resolve,
    guardSwitch: guard,
    selectLine,
    createLine,
    renameLine,
    updateLine,
    deleteLine,
    addScene,
    selectScene,
    updateScene,
    deleteScene
  }
}
