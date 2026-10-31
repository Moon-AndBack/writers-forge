import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ActivityActionsContext } from './activityActions'
import type { ActivityActionMap, ActivityActionsContextValue } from './activityActions'
import type { WriterModule } from './activityBarModules'

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
