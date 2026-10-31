import { createContext, useContext, useEffect } from 'react'
import type { WriterModule } from './activityBarModules'

export interface ActivityBarContextValue {
  /** 当前激活模块，默认 `chapters`。 */
  active: WriterModule
  /** 切换激活模块。 */
  setActive: (module: WriterModule) => void
  /** 是否渲染活动栏：由「是否有页面注册」决定。 */
  visible: boolean
  /** 页面注册 / 注销回调（内部使用，保持引用稳定避免注册循环）。 */
  register: () => void
  unregister: () => void
}

export const ActivityBarContext = createContext<ActivityBarContextValue | null>(null)

/**
 * 读取活动栏状态。无 Provider（如独立测试渲染）时回退为不可见，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useActivityBar(): {
  active: WriterModule
  setActive: (module: WriterModule) => void
  visible: boolean
} {
  const context = useContext(ActivityBarContext)
  if (!context) {
    return { active: 'chapters', setActive: () => undefined, visible: false }
  }
  return { active: context.active, setActive: context.setActive, visible: context.visible }
}

/**
 * 页面声明「本页需要活动栏」：`enabled` 为 true 时注册，卸载或置 false 时注销。
 * 无活动栏 Provider 时为空操作（不影响既有页面）。
 */
export function useRegisterActivityBar(enabled: boolean): void {
  const context = useContext(ActivityBarContext)
  const register = context?.register
  const unregister = context?.unregister

  useEffect(() => {
    if (!enabled || !register || !unregister) return undefined
    register()
    return () => unregister()
  }, [enabled, register, unregister])
}
