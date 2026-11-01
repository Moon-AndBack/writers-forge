import { createContext, useCallback, useContext, useEffect } from 'react'
import type { WriterModule } from './activityBarModules'
import { useActivityBar } from './activityBarContext'

/**
 * 模块切换守卫插槽（外壳层）：活动栏图标 / 筛选浮层的「切换模块」动作统一经
 * `useRequestSwitch()` 发起，由**页面注册的守卫**决定是否要先处理未保存草稿
 * （当前为写作页的设定档案五域右栏正文）；无注册者时降级为直接 `setActive`。
 *
 * 与 `activityActions` 同范式：页面只注册回调、外壳只读插槽；Provider 的
 * `children` 由上层以稳定引用传入，注册只重渲染读取插槽的外壳节点，不回灌页面子树，
 * 故无注册循环。`setGuard` 用 `useCallback([])` 保持引用稳定，避免注册抖动。
 *
 * 守卫契约：`handler(target)` 自己完成切换（含弹确认框后异步切换），外壳只负责转发。
 */
export type UnsavedSwitchGuard = (target: WriterModule) => void | Promise<void>

export interface UnsavedSwitchGuardContextValue {
  /** 当前注册的守卫（null = 无页面注册，切模块降级为直接切换）。 */
  guard: UnsavedSwitchGuard | null
  /** 注册 / 注销守卫（内部使用，引用稳定）。 */
  setGuard: (guard: UnsavedSwitchGuard | null) => void
}

/** 守卫插槽上下文本体（Provider 见 `unsavedSwitchGuardProvider.tsx`）。 */
export const UnsavedSwitchGuardContext = createContext<UnsavedSwitchGuardContextValue | null>(null)

/**
 * 页面注册「切模块前处理未保存改动」的守卫：挂载 / 回调变化时写入，卸载或置空时注销。
 * 无 Provider 时为空操作；`handler` 应由调用方 `useCallback` 缓存。
 */
export function useRegisterUnsavedSwitchGuard(handler: UnsavedSwitchGuard): void {
  const context = useContext(UnsavedSwitchGuardContext)
  const setGuard = context?.setGuard

  useEffect(() => {
    if (!setGuard) return undefined
    setGuard(handler)
    return () => setGuard(null)
  }, [setGuard, handler])
}

/**
 * 外壳侧发起模块切换：有注册守卫则交给守卫裁决（可能弹未保存确认），
 * 无注册者（如书架 / 未挂载写作页）降级为直接 `setActive`，保证任何模块都切得过去。
 */
export function useRequestSwitch(): (module: WriterModule) => void {
  const context = useContext(UnsavedSwitchGuardContext)
  const { setActive } = useActivityBar()
  const guard = context?.guard ?? null

  return useCallback(
    (module: WriterModule): void => {
      if (!guard) {
        setActive(module)
        return
      }
      void guard(module)
    },
    [guard, setActive]
  )
}
