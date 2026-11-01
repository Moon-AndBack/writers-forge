import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { UnsavedSwitchGuardContext } from './unsavedSwitchGuard'
import type { UnsavedSwitchGuard, UnsavedSwitchGuardContextValue } from './unsavedSwitchGuard'

/** 模块切换守卫 Provider：包裹窗口外壳（置于 ActivityBarProvider 内层）。 */
export function UnsavedSwitchGuardProvider({ children }: { children: ReactNode }) {
  const [guard, setGuardState] = useState<UnsavedSwitchGuard | null>(null)

  // state 里直接放函数会被 React 当作 updater 调用：包一层 updater 返回原函数。
  const setGuard = useCallback((next: UnsavedSwitchGuard | null): void => {
    setGuardState(() => next)
  }, [])

  const value = useMemo<UnsavedSwitchGuardContextValue>(
    () => ({ guard, setGuard }),
    [guard, setGuard]
  )

  return (
    <UnsavedSwitchGuardContext.Provider value={value}>
      {children}
    </UnsavedSwitchGuardContext.Provider>
  )
}
