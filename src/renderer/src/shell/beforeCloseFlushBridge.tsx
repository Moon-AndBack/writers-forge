import { useEffect, useRef } from 'react'
import { useFlushAllBeforeClose } from './beforeCloseFlush'

/**
 * 关闭前落盘桥（须挂在 `BeforeCloseFlushProvider` 内层）：
 * 主进程拦截窗口关闭 → 发 `app:before-close` → 由本桥统一落盘 → 回执 `app:close-ready`。
 *
 * 契约：无论各模块保存成功与否都**必须**回执（`try/finally`），否则主进程只能等
 * 3 秒超时强关，未完成保存的模块失去最后窗口。`flushAll` 自身恒 resolve。
 */
export function BeforeCloseFlushBridge(): null {
  const flushAll = useFlushAllBeforeClose()

  // 用 ref 持有最新的 flushAll，让订阅只建立一次：避免 handler 增删触发重订阅时，
  // 恰好落在「已取消 / 未重订阅」的间隙里丢掉主进程的关闭通知。
  const flushAllRef = useRef(flushAll)
  useEffect(() => {
    flushAllRef.current = flushAll
  }, [flushAll])

  useEffect(() => {
    const bridge = window.api?.app
    if (!bridge) return undefined

    // StrictMode 双挂载：onBeforeClose 返回 removeListener，effect 清理成对取消订阅。
    return bridge.onBeforeClose(() => {
      void (async (): Promise<void> => {
        try {
          await flushAllRef.current()
        } finally {
          bridge.notifyCloseReady()
        }
      })()
    })
  }, [])

  return null
}
