import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface TitleBarActionsContextValue {
  actions: ReactNode
  setActions: (actions: ReactNode) => void
}

const TitleBarActionsContext = createContext<TitleBarActionsContextValue | null>(null)

/**
 * 标题栏操作插槽 Provider：包裹窗口外壳，使当前页面能把自己的操作节点
 * （如「新建书籍」按钮）注册到 `.titlebar` 的页面上下文操作区
 * （`.tb-page-actions`，位于品牌区 / 返回图标右侧、`.tb-spacer` 之前），
 * 卸载时自动清理。
 *
 * 由于 `children` 由上层（App）以稳定引用传入，Provider 自身 state 变化
 * 只会重渲染读取插槽的消费者，不会重渲染页面子树，因此不会产生注册循环。
 */
export function TitleBarActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode>(null)

  const value = useMemo<TitleBarActionsContextValue>(() => ({ actions, setActions }), [actions])

  return <TitleBarActionsContext.Provider value={value}>{children}</TitleBarActionsContext.Provider>
}

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
