import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isValidElement } from 'react'
import { useActivityBar } from './activityBarContext'
import type { WriterModule } from './activityBar'
import { StatusBarContext, useResolvedStatusBarSlots } from './statusBarContext'
import type { StatusBarSlots, StatusBarState } from './statusBarContext'
import '../styles/statusbar.css'
import '../styles/statusbar-widgets.css'

/**
 * 状态栏插槽 Provider：包裹窗口外壳，使当前页面 / 写作模块能把自己的状态栏内容
 * 注册到 `.statusbar`，卸载时自动清理。
 *
 * 状态分两层（`StatusBarState`）：`page`（页面级，如书架页）+ `modules`
 * （写作页各模块各自拥有）。外壳按当前活动模块取 `modules[active] ?? page`。
 *
 * 由于 `children` 由上层（App）以稳定引用传入，Provider 自身 state 变化
 * 只会重渲染状态栏消费者，不会重渲染页面子树，因此不会产生注册循环。
 * `setPageSlots` / `setModuleSlots` 用 `useCallback([])` + 函数式更新保持引用稳定，
 * 避免「注册 → 上下文变化 → effect 依赖变化 → 再注册」的抖动。
 */
export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StatusBarState>({ page: {}, modules: {} })

  const setPageSlots = useCallback((slots: StatusBarSlots): void => {
    setState((prev) => (prev.page === slots ? prev : { ...prev, page: slots }))
  }, [])

  const setModuleSlots = useCallback(
    (module: WriterModule, slots: StatusBarSlots | null | undefined): void => {
      setState((prev) => {
        if (prev.modules[module] === slots) return prev
        const modules = { ...prev.modules }
        if (slots === null || slots === undefined) delete modules[module]
        else modules[module] = slots
        return { ...prev, modules }
      })
    },
    []
  )

  const value = useMemo(
    () => ({ state, setPageSlots, setModuleSlots }),
    [state, setPageSlots, setModuleSlots]
  )

  return <StatusBarContext.Provider value={value}>{children}</StatusBarContext.Provider>
}

/** 外壳状态栏：渲染当前活动模块 / 页面注册的左右插槽 + 外壳级小部件（children，`.st-right`）。
 *
 * 取值规则：`modules[active] ?? page`——写作页已注册的模块用其自身状态栏，
 * 未注册模块回退页面级插槽（写作页未注册页面级时为空白）；
 * 书架等非写作页 `active` 固定为 `chapters` 且 `modules.chapters` 未注册，回退 `page`。
 *
 * 布局顺序：`leading`（外壳级，如最左图钉）→ `left`（模块 / 页面注册）
 * → spacer → `right` → children（`.st-right`：排版 / 缩放）。
 * `left` 为空时不渲染任何占位。
 */
export default function StatusBar({
  className,
  leading,
  children
}: {
  className?: string
  leading?: ReactNode
  children?: ReactNode
}) {
  const { active } = useActivityBar()
  const { left, right } = useResolvedStatusBarSlots(active)

  return (
    <footer className={className ? `statusbar ${className}` : 'statusbar'}>
      {isValidElement(leading) ? <div className="st-leading">{leading}</div> : null}
      {left}
      <span className="st-spacer" />
      {right}
      {children}
    </footer>
  )
}
