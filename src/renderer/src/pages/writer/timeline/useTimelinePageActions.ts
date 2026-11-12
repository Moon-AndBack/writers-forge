/**
 * 时间线页级动作 hook：把 `Writer.tsx` 内的切换 / 新建 / 重命名 / 删除
 * 统一收进一处，避免页面层继续逼近单文件 500 行上限（AGENTS §3）。
 *
 * 行为与原先页面内联回调逐字一致：
 * - 切换 / 新建 / 删除当前 active 都会改 `activeTimelineId`，故先 `flushModule('timeline')`
 *   补存未提交的起点名 + 描述，再过剧情切换守卫；
 * - 重命名（时间线名）不改变 active，不触发守卫，失败返回 false 交面板提示；
 * - 删除失败统一 toast `saveFailedMessage`（与页面其它保存失败同款）。
 */
import { useCallback } from 'react'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import type { WriterModule } from '../../../shell/activityBarModules'
import type { TimelineWorkspace } from './useTimelineWorkspace'

export interface TimelinePageActions {
  /** 切换时间线（先补存当前时间线起点名 + 描述，再过剧情切换守卫）。 */
  handleSelectTimeline: (id: string) => Promise<void>
  /** 新建时间线（隐式切换，同样先补存再过守卫）。 */
  handleCreateTimeline: (name: string, description?: RichTextBodyValue) => Promise<void>
  /** 重命名时间线（active 不变，结果交回面板提示）。 */
  handleRenameTimeline: (id: string, name: string) => Promise<boolean>
  /** 删除时间线（删当前 active 等同隐式切换；失败 toast 并返回 false）。 */
  handleDeleteTimeline: (id: string) => Promise<boolean>
}

export function useTimelinePageActions(
  timeline: TimelineWorkspace,
  guardSwitch: (proceed: () => void) => void,
  flushModule: (module: WriterModule) => Promise<boolean>,
  showSaveFailed: (message: string) => void,
  saveFailedMessage: string
): TimelinePageActions {
  // 先取出稳定成员再进回调依赖，避免整个 `timeline` 装配对象入依赖（每次渲染新引用）。
  const {
    activeId: activeTimelineId,
    selectTimeline,
    createTimeline,
    renameTimeline,
    removeTimeline
  } = timeline

  const handleSelectTimeline = useCallback(
    async (id: string): Promise<void> => {
      if (id === activeTimelineId) return
      await flushModule('timeline')
      guardSwitch(() => selectTimeline(id))
    },
    [activeTimelineId, selectTimeline, guardSwitch, flushModule]
  )

  // 新建时间线内部同样 `setActiveId`（隐式切换），入参与返回值语义保持原样：
  // 调用方仅 `void` 调用、不消费返回值，故包装后仍以 void 暴露。
  const handleCreateTimeline = useCallback(
    async (name: string, description?: RichTextBodyValue): Promise<void> => {
      await flushModule('timeline')
      guardSwitch(() => {
        // 弹窗已产出富文本归一值（`text` + `json`），原样落库；缺省为空文档。
        void createTimeline(name, description)
      })
    },
    [guardSwitch, createTimeline, flushModule]
  )

  // 时间线重命名：active 不变，不触发剧情切换守卫；结果交回面板做失败提示。
  const handleRenameTimeline = useCallback(
    (id: string, name: string): Promise<boolean> => renameTimeline(id, name).catch(() => false),
    [renameTimeline]
  )

  // 删除时间线：删当前 active 等同隐式切换（先补存 + 剧情守卫）；删其它条目不影响当前上下文，直接执行。
  const handleDeleteTimeline = useCallback(
    async (id: string): Promise<boolean> => {
      const run = (): Promise<boolean> =>
        removeTimeline(id)
          .catch(() => false)
          .then((ok) => {
            if (!ok) showSaveFailed(saveFailedMessage)
            return ok
          })
      if (id !== activeTimelineId) return run()
      await flushModule('timeline')
      guardSwitch(() => {
        void run()
      })
      return true
    },
    [activeTimelineId, guardSwitch, removeTimeline, showSaveFailed, saveFailedMessage, flushModule]
  )

  return {
    handleSelectTimeline,
    handleCreateTimeline,
    handleRenameTimeline,
    handleDeleteTimeline
  }
}
