import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface TitleBarActionsContextValue {
  actions: ReactNode
  setActions: (actions: ReactNode) => void
}

/** 标题栏操作上下文本体（Provider 见 `titleBarActionsProvider.tsx`）。 */
export const TitleBarActionsContext = createContext<TitleBarActionsContextValue | null>(null)

/** 读取当前标题栏操作插槽（供外壳 `.tb-page-actions` 使用）；未注册时为 null。 */
export function useTitleBarActions(): ReactNode {
  const context = useContext(TitleBarActionsContext)
  return context?.actions ?? null
}

/**
 * 页面注册标题栏操作节点：挂载 / 节点变化时写入，卸载时清空。
 *
 * 调用方应传入稳定引用的节点（如 useMemo 缓存），避免无意义的重注册。
 * 由于 Provider 的 children 引用稳定，注册触发的重渲染不会回灌到页面，故无循环。
 */
export function useSetTitleBarActions(node: ReactNode): void {
  const context = useContext(TitleBarActionsContext)
  const setActions = context?.setActions

  useEffect(() => {
    if (!setActions) return undefined
    setActions(node)
    return () => setActions(null)
  }, [setActions, node])
}
