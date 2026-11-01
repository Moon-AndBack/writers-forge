/**
 * 通用「未保存守卫」：有脏先挂起动作，再按两态结算（保存 / 放弃）。
 *
 * 与域无关：调用方只提供 `dirty` / `save` / `discard` 三件事，hook 负责
 * 「有脏挂起、无脏立即执行」与「保存结算期间忽略重复结算」的时序。
 *
 * `guard` 供事件回调调用，读内部 `dirtyRef` 而非渲染闭包，保证拿到最新脏态；
 * `dirty` 变化经 effect 同步到 ref（渲染期写 ref 被 `react-hooks/refs` 禁止）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface UnsavedGuardSource {
  dirty: boolean
  /** 无条件落库：无改动也应 resolve(true)；失败 resolve(false)；不得抛错。 */
  save: () => Promise<boolean>
  /** 放弃草稿：真丢弃（清脏 + 表单回到行值）。 */
  discard: () => void
}

export interface UnsavedGuard {
  /** 净 → 立即执行 proceed 返回 true；脏 → 挂起返回 false。 */
  guard: (proceed: () => void) => boolean
  pending: boolean
  /** 保存结算中；弹框据此禁用按钮，且此期间 resolve 一律忽略。 */
  confirming: boolean
  /**
   * true = 先 await save()，成功才 proceed → true；失败不 proceed、脏保留 → false；
   * false = 先 discard() 再 proceed → 恒 true。
   */
  resolve: (save: boolean) => Promise<boolean>
  /** 脏才落库（净 → true）。 */
  flush: () => Promise<boolean>
  /** 丢弃挂起动作（不清脏、不落库），供装配失效清理。 */
  clearPending: () => void
}

export function useUnsavedGuard({ dirty, save, discard }: UnsavedGuardSource): UnsavedGuard {
  const [pendingAction, setPendingAction] = useState<{ proceed: () => void } | null>(null)
  // 事件回调读同步值：state 要等下一次渲染才可见，连点 / Esc 不能等到那时。
  const pendingRef = useRef<{ proceed: () => void } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)

  // 最新脏态 / 数据源：提交后同步进 ref，事件回调据此取最新值。
  const dirtyRef = useRef(dirty)
  const sourceRef = useRef({ save, discard })
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])
  useEffect(() => {
    sourceRef.current = { save, discard }
  }, [save, discard])

  const clearPending = useCallback((): void => {
    pendingRef.current = null
    setPendingAction(null)
  }, [])

  const guard = useCallback((proceed: () => void): boolean => {
    if (!dirtyRef.current) {
      proceed()
      return true
    }
    // 已有挂起动作：忽略新动作，不覆盖用户正在结算的那一个。
    if (pendingRef.current) return false
    const action = { proceed }
    pendingRef.current = action
    setPendingAction(action)
    return false
  }, [])

  const flush = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true
    try {
      return await sourceRef.current.save()
    } catch {
      return false
    }
  }, [])

  const resolve = useCallback(
    async (shouldSave: boolean): Promise<boolean> => {
      // 保存结算中：Esc / 遮罩 / 连点一律忽略，避免「保存途中被判放弃」。
      if (confirmingRef.current) return false
      const action = pendingRef.current
      if (!action) return false

      if (!shouldSave) {
        // 真丢弃：先清脏再切，装配清理 effect 才不会二次静默保存。
        sourceRef.current.discard()
        clearPending()
        action.proceed()
        return true
      }

      confirmingRef.current = true
      setConfirming(true)
      let ok = false
      try {
        ok = await sourceRef.current.save()
      } catch {
        // `save` 约定不抛错；兜底按失败处理（不清脏、不切换）。
      }
      confirmingRef.current = false
      setConfirming(false)
      // 失败同样关框：脏态保留，用户可再点一次重试。
      clearPending()
      if (!ok) return false
      action.proceed()
      return true
    },
    [clearPending]
  )

  return {
    guard,
    pending: pendingAction !== null,
    confirming,
    resolve,
    flush,
    clearPending
  }
}
