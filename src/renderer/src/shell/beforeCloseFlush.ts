import { createContext, useCallback, useContext, useEffect } from 'react'
import type { RefObject } from 'react'
import { createLogger } from '@renderer/lib/log'

/** 关闭前统一保存日志（转发至主进程落盘）。 */
const log = createLogger('beforeCloseFlush')

/**
 * 关闭前统一保存插槽（外壳层）：
 *
 * 应用关闭前由外壳调用 `useFlushAllBeforeClose()` 取到的 `flushAll`，把所有模块的
 * 未落库内容依次写入数据库（章节正文 / 大纲正文 / 剧情场景草稿 / 设定档案草稿）。
 * 页面只注册处理器、外壳只读插槽；主进程在窗口 `close` 时通知渲染层，
 * 由 `beforeCloseFlushBridge.tsx` 调用本 hook 并回执，落盘完成后窗口才真正关闭。
 *
 * 契约：
 * - 处理器 `handler()` 自己完成「把该模块未保存内容写库」，可同步、可异步；
 * - 单个处理器抛错 / 拒绝**不得**阻断其它处理器，`flushAll` **恒 resolve**（不抛出）——
 *   关闭流程不能被某个模块的保存失败永久挂住，失败由各模块自身的 `status='error'` /
 *   脏态保留来体现（用户下次可重试）。
 */
export type BeforeCloseFlushHandler = () => void | Promise<void>

export interface BeforeCloseFlushContextValue {
  /** 已注册处理器（快照；外壳侧只读）。 */
  handlers: readonly BeforeCloseFlushHandler[]
  /** 注册处理器，返回注销函数（内部使用，引用稳定）。 */
  register: (handler: BeforeCloseFlushHandler) => () => void
}

/** 插槽上下文本体（Provider 见 `beforeCloseFlushProvider.tsx`）。 */
export const BeforeCloseFlushContext = createContext<BeforeCloseFlushContextValue | null>(null)

/**
 * 页面注册「关闭前把未保存内容写库」的处理器：挂载 / 回调变化时注册，卸载时注销。
 * 无 Provider 时为空操作；`handler` 应由调用方 `useCallback` 缓存，避免注册抖动。
 */
export function useRegisterBeforeCloseFlush(handler: BeforeCloseFlushHandler): void {
  const register = useContext(BeforeCloseFlushContext)?.register

  useEffect(() => {
    if (!register) return undefined
    return register(handler)
  }, [register, handler])
}

/**
 * 外壳侧取得「关闭前统一保存」入口：
 * 依次 await 各注册处理器，单个失败仅记日志、不阻断后续，整体 promise 一定 resolve。
 */
export function useFlushAllBeforeClose(): () => Promise<void> {
  const handlers = useContext(BeforeCloseFlushContext)?.handlers

  return useCallback(async (): Promise<void> => {
    if (!handlers || handlers.length === 0) return
    // 快照：执行期间即使有新的注册 / 注销也不影响本轮关闭流程。
    for (const handler of [...handlers]) {
      try {
        await handler()
      } catch (error) {
        log.warn('关闭前保存失败（已跳过该模块）', error)
      }
    }
  }, [handlers])
}

/**
 * 视图侧配合：把本视图的「立即落盘」入口同步到页面层 ref（挂载写入、卸载置空），
 * 供 `useFlushAllModules` 在关闭前聚合调用。`handler` 应由调用方 `useCallback` 缓存。
 */
export function useSyncFlushHandler(
  ref: RefObject<(() => Promise<void>) | null> | undefined,
  handler: () => Promise<void>
): void {
  useEffect(() => {
    if (!ref) return undefined
    ref.current = handler
    return () => {
      if (ref.current === handler) ref.current = null
    }
  }, [ref, handler])
}
