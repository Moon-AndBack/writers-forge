import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { WriterModule } from './activityBar'

/**
 * 模块级「页面动作」插槽：写作页各模块的标题栏操作区（如章节视图的
 * 「新建卷 ｜ 保存 · 撤销 · 重做 ｜ 搜索 ｜ 回收站」）把操作按钮注册到
 * 外壳，由消费方渲染（当前为标题栏：`.tb-module-actions`，位于返回书架图标右侧；
 * 仅写作页有注册动作的模块有值，如章节 / 大纲）。
 *
 * 与 statusBar / titleBarActions 同范式：Provider 的 `children` 由上层以稳定引用
 * 传入，页面注册只重渲染读取插槽的外壳节点，不回灌页面子树，故无注册循环。
 * `setAction` 用 `useCallback([])` + 函数式更新保持引用稳定，避免
 * 「注册 → 上下文变化 → effect 依赖变化 → 再注册」的抖动。
 */
export type ActivityActionMap = Partial<Record<WriterModule, ReactNode>>

interface ActivityActionsContextValue {
  actions: ActivityActionMap
  setAction: (module: WriterModule, node: ReactNode) => void
}

const ActivityActionsContext = createContext<ActivityActionsContextValue | null>(null)

/** 模块级动作 Provider：包裹窗口外壳（置于 ActivityBarProvider 内层）。 */
export function ActivityActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ActivityActionMap>({})

  const setAction = useCallback((module: WriterModule, node: ReactNode): void => {
    setActions((prev) => {
      if (prev[module] === node) return prev
      const next: ActivityActionMap = { ...prev }
      if (node === null || node === undefined) delete next[module]
      else next[module] = node
      return next
    })
  }, [])

  const value = useMemo<ActivityActionsContextValue>(
    () => ({ actions, setAction }),
    [actions, setAction]
  )

  return <ActivityActionsContext.Provider value={value}>{children}</ActivityActionsContext.Provider>
}

/** 读取指定模块注册的动作节点（无 Provider / 未注册时为 null）。 */
export function useActivityActions(module: WriterModule): ReactNode {
  const context = useContext(ActivityActionsContext)
  return context?.actions[module] ?? null
}

/**
 * 页面注册某模块的动作节点：挂载 / 节点变化时写入，卸载或置 null 时清除。
 * 无 Provider 时为空操作（不影响既有页面）；`node` 应由调用方 `useMemo` 缓存。
 */
export function useSetActivityActions(module: WriterModule, node: ReactNode): void {
  const context = useContext(ActivityActionsContext)
  const setAction = context?.setAction

  useEffect(() => {
    if (!setAction) return undefined
    setAction(module, node)
    return () => setAction(module, null)
  }, [setAction, module, node])
}
