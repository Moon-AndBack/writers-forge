import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { WriterModule } from './activityBar'

/** 状态栏左右两个插槽（未注册时为空）。 */
export interface StatusBarSlots {
  /** 左侧插槽（通常为页面主状态） */
  left?: ReactNode
  /** 右侧插槽（通常为统计 / 辅助信息） */
  right?: ReactNode
}

/** 模块级状态栏插槽映射：每个写作模块各自拥有自己的状态栏内容（仅已注册模块有值）。 */
export type ModuleStatusBarMap = Partial<Record<WriterModule, StatusBarSlots>>

/**
 * 状态栏插槽状态：
 * - `page`：页面级插槽（非写作模块页面使用，如书架页统计）；
 * - `modules`：模块级插槽（写作页各模块各自拥有，按当前活动模块整块切换）。
 *
 * 消费方按 `modules[active] ?? page` 取值：已注册的模块用其自身内容，
 * 未注册模块（如大纲 / 剧情）回退页面级插槽（写作页未注册页面级时为空白）。
 */
export interface StatusBarState {
  page: StatusBarSlots
  modules: ModuleStatusBarMap
}

interface StatusBarContextValue {
  state: StatusBarState
  setPageSlots: (slots: StatusBarSlots) => void
  setModuleSlots: (module: WriterModule, slots: StatusBarSlots | null | undefined) => void
}

const StatusBarContext = createContext<StatusBarContextValue | null>(null)

/** 无 Provider（如独立测试渲染）时的空状态：稳定引用，避免无谓重渲染。 */
const EMPTY_STATE: StatusBarState = { page: {}, modules: {} }

/** 读取当前状态栏插槽（供外壳 `.statusbar` 使用）：`page` + 各模块映射。 */
export function useStatusBarSlots(): StatusBarState {
  const context = useContext(StatusBarContext)
  return context?.state ?? EMPTY_STATE
}

/**
 * 读取当前活动模块 / 页面**已解析**的插槽（`modules[active] ?? page`）。
 *
 * 外壳统一取值入口：`statusBar.tsx` 渲染左右插槽；`App.tsx` 的全局 `.st-right`
 * 据此判断「当前模块是否已自带右下角」（自带则跳过全局排版组，避免重复控件）。
 */
export function useResolvedStatusBarSlots(active: WriterModule): StatusBarSlots {
  const { page, modules } = useStatusBarSlots()
  return modules[active] ?? page
}

/**
 * 页面注册状态栏内容（页面级，如书架页）：挂载 / 内容变化时写入 `page`，卸载时清空。
 *
 * 调用方应传入稳定引用的 slots 对象（如 useMemo 缓存），避免无意义的重注册。
 * 由于 Provider 的 children 引用稳定，注册触发的重渲染不会回灌到页面，故无循环。
 */
export function useSetStatusBar(slots: StatusBarSlots): void {
  const context = useContext(StatusBarContext)
  const setSlots = context?.setPageSlots

  useEffect(() => {
    if (!setSlots) return undefined
    setSlots(slots)
    return () => setSlots({})
  }, [setSlots, slots])
}

/**
 * 页面注册某**模块**的状态栏内容（写作页各模块各自拥有）：挂载 / 内容变化时写入，
 * 卸载或置 null/undefined 时清除该模块条目。无 Provider 时为空操作。
 * `slots` 应由调用方 `useMemo` 缓存；外壳按当前活动模块选区（`modules[active]`）。
 */
export function useSetModuleStatusBar(
  module: WriterModule,
  slots: StatusBarSlots | null | undefined
): void {
  const context = useContext(StatusBarContext)
  const setModuleSlots = context?.setModuleSlots

  useEffect(() => {
    if (!setModuleSlots) return undefined
    setModuleSlots(module, slots)
    return () => setModuleSlots(module, null)
  }, [setModuleSlots, module, slots])
}

/** context 仅供 statusBar.tsx 的 Provider 内部装配使用。 */
export { StatusBarContext }
export type { StatusBarContextValue }
