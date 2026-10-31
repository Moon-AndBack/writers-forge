/**
 * 设定档案脏态 / 保存入口 / 切换守卫（自 `useDossierWorkspace.ts` 拆出，§3 ≤500 行）。
 *
 * 右栏只改本地草稿，点保存才落库；切换选中有脏则弹两态确认（`guardSwitch` /
 * `resolveSwitch`），切模块 / 换书时右栏卸载前自动保存兜底。
 *
 * `saveRef` 为**原样透出**的 ref 对象：右栏表单挂载时直接写 `.current`，
 * 此处不得包装 / 转换，否则调用方写入的不是同一个 ref。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { DossierModule } from './dossierTree'

export interface DossierDirtyGuard {
  /** 当前是否有未保存改动（右栏保存按钮 / 切换守卫共用）。 */
  dirty: boolean
  /** 右栏编辑器上报脏态（表单挂载后按草稿与详情比对调用）。 */
  reportDirty: (dirty: boolean) => void
  /** 立即落库当前草稿（有脏才写）；返回写入 promise 供「先保存再新建」等待。 */
  flushDraft: () => Promise<void>
  /** 保存入口 ref：右栏表单挂载时写入 `saveNow`；原样透出，不得包装。 */
  saveRef: RefObject<(() => void | Promise<void>) | null>
  /** 是否有挂起的切换（有改动时点选卡片 / 新建暂缓，等两态确认）。 */
  switchPending: boolean
  /** 结算挂起的切换：`save=true` 先保存草稿再切换，`false` 丢弃草稿直接切换。 */
  resolveSwitch: (save: boolean) => void
  /** 切换守卫：无未保存改动立即执行；有改动则暂缓为该动作，等两态确认（保存 / 不保存）。 */
  guardSwitch: (proceed: () => void) => void
}

/**
 * `active` / `bookId` 仅用于「装配失效」的清理时机（切模块 / 换书），
 * 不参与脏态本身的计算。
 */
export function useDossierDirtyGuard(
  active: DossierModule | null,
  bookId: string
): DossierDirtyGuard {
  // 未保存改动（右栏编辑器上报）+ 挂起的切换动作（有改动时暂缓执行，等两态确认）。
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  // 保存入口：右栏表单挂载时写入（切换确认「保存」/ 切模块兜底据此落库当前草稿）。
  const saveRef = useRef<(() => void | Promise<void>) | null>(null)
  const [pendingSwitch, setPendingSwitch] = useState<{ proceed: () => void } | null>(null)

  const reportDirty = useCallback((next: boolean): void => {
    dirtyRef.current = next
    setDirty(next)
  }, [])

  /** 立即落库当前草稿（有脏才写）；返回写入 promise 供「先保存再新建」等待。 */
  const flushDraft = useCallback(async (): Promise<void> => {
    if (!dirtyRef.current) return
    await saveRef.current?.()
  }, [])

  /** 切换守卫：无未保存改动立即执行；有改动则暂缓为该动作，等两态确认（保存 / 不保存）。 */
  const guardSwitch = useCallback((proceed: () => void): void => {
    if (!dirtyRef.current) {
      proceed()
      return
    }
    setPendingSwitch({ proceed })
  }, [])

  const resolveSwitch = useCallback(
    (save: boolean): void => {
      const pending = pendingSwitch
      setPendingSwitch(null)
      // 草稿将随切换失效：「保存」先落库，「不保存」直接丢弃（表单卸载时不再自动保存，
      // 丢弃即真丢弃）；脏态由切换后重挂的表单自行上报，此处不代写。
      if (save) void saveRef.current?.()
      pending?.proceed()
    },
    [pendingSwitch]
  )

  /**
   * 切模块 / 换书 / 离开写作页：右栏详情是**条件挂载**，脏草稿会随卸载丢失——
   * 在「本次装配失效」的清理阶段先自动保存兜底。`saveRef` 不随表单卸载注销
   * （见 `DossierDetailForm`），此处仍能取到最后一笔草稿；清脏避免重复回写。
   */
  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return
      dirtyRef.current = false
      setDirty(false)
      // 必须读清理时刻的 ref 值：右栏表单在本 effect 之后才把新 `saveNow` 写入，
      // 提前拷贝会拿到新模块（或空）的表单，兜底就落不到旧草稿。
      // eslint-disable-next-line react-hooks/exhaustive-deps
      void saveRef.current?.()
    }
  }, [active, bookId])

  return {
    dirty,
    reportDirty,
    flushDraft,
    saveRef,
    switchPending: pendingSwitch !== null,
    resolveSwitch,
    guardSwitch
  }
}
