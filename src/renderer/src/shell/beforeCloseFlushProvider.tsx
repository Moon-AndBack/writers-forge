import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BeforeCloseFlushContext } from './beforeCloseFlush'
import type { BeforeCloseFlushContextValue, BeforeCloseFlushHandler } from './beforeCloseFlush'

/**
 * 关闭前统一保存 Provider：包裹窗口外壳（置于 `UnsavedSwitchGuardProvider` 内层）。
 * `children` 由上层以稳定引用传入，注册只重渲染读取插槽的外壳节点，不回灌页面子树。
 */
export function BeforeCloseFlushProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<BeforeCloseFlushHandler[]>([])

  // 注册 / 注销：按引用增删；同一处理器重复注册不重复入表（StrictMode 双挂载安全）。
  const register = useCallback((handler: BeforeCloseFlushHandler): (() => void) => {
    setHandlers((prev) => (prev.includes(handler) ? prev : [...prev, handler]))
    return () => setHandlers((prev) => prev.filter((item) => item !== handler))
  }, [])

  const value = useMemo<BeforeCloseFlushContextValue>(
    () => ({ handlers, register }),
    [handlers, register]
  )

  return (
    <BeforeCloseFlushContext.Provider value={value}>{children}</BeforeCloseFlushContext.Provider>
  )
}
