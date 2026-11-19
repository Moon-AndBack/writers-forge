/**
 * 设定档案脏态 / 保存入口 / 切换守卫（自 `useDossierWorkspace.ts` 拆出，§3 ≤500 行）。
 *
 * 右栏只改本地草稿，点保存才落库；切换选中有脏则弹两态确认（`guardSwitch` /
 * `resolveSwitch`），切模块 / 换书时右栏卸载前自动保存兜底。
 *
 * 挂起 / 两态结算的时序统一交给通用 `shell/useUnsavedGuard`，保存入口桥接交给
 * `shell/useDraftSaveBridge`，本 hook 只做域适配（脏态上报、放弃草稿、卸载兜底）
 * 并保持原有对外成员名，调用方零改动。
 *
 * `saveRef` 由共享桥**原样透出**：右栏表单挂载时直接写 `.current`，
 * 不得包装 / 转换，否则表单写入的不是同一个 ref。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useDraftSaveBridge } from '../../../shell/useDraftSaveBridge'
import { useUnsavedGuard } from '../../../shell/useUnsavedGuard'
import type { DossierModule } from './dossierTree'

export interface DossierDirtyGuard {
  /** 当前是否有未保存改动（右栏保存按钮 / 切换守卫共用）。 */
  dirty: boolean
  /** 右栏编辑器上报脏态（表单挂载后按草稿与详情比对调用）。 */
  reportDirty: (dirty: boolean) => void
  /** 立即落库当前草稿（有脏才写）；返回值 = 是否落库成功（无脏视为成功）。 */
  flushDraft: () => Promise<boolean>
  /** 放弃当前草稿（**先清脏**，切模块时清理 effect 不再二次静默保存）。 */
  discardDraft: () => void
  /** 保存入口 ref：右栏表单挂载时写入 `saveNow`；原样透出，不得包装。 */
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  /** 是否有挂起的切换（有改动时点选卡片 / 新建暂缓，等两态确认）。 */
  switchPending: boolean
  /**
   * 结算挂起的切换：`save=true` 先落库再切换，`false` 丢弃草稿直接切换。
   * 返回值 = 是否已执行切换：保存失败时为 `false`（不切换、不清脏，可重试）。
   */
  resolveSwitch: (save: boolean) => Promise<boolean>
  /** 切换守卫：无未保存改动立即执行；有改动则暂缓为该动作，等两态确认（保存 / 不保存）。 */
  guardSwitch: (proceed: () => void) => void
  /** 保存结算中：确认弹框据此禁用按钮，期间重复结算一律忽略。 */
  confirming: boolean
}

/**
 * `active` / `bookId` 仅用于「装配失效」的清理时机（切模块 / 换书），
 * 不参与脏态本身的计算。
 */
export function useDossierDirtyGuard(
  active: DossierModule | null,
  bookId: string
): DossierDirtyGuard {
  // 未保存改动（右栏编辑器上报）。
  const [dirty, setDirty] = useState(false)
  const dirtyRef = useRef(false)
  // 保存入口：右栏表单挂载时写入（切换确认「保存」/ 切模块兜底据此落库当前草稿）。
  const { saveRef, save } = useDraftSaveBridge({
    scope: 'dossier',
    failMessage: '保存设定档案草稿失败'
  })

  const reportDirty = useCallback((next: boolean): void => {
    dirtyRef.current = next
    setDirty(next)
  }, [])

  /** 放弃当前草稿：先清脏，后续切模块的清理 effect 才不会二次静默保存。 */
  const discardDraft = useCallback((): void => {
    reportDirty(false)
  }, [reportDirty])

  const { guard, pending, confirming, resolve, flush, clearPending } = useUnsavedGuard({
    dirty,
    save,
    discard: discardDraft
  })

  /**
   * 切模块 / 换书 / 离开写作页：右栏详情是**条件挂载**，脏草稿会随卸载丢失——
   * 在「本次装配失效」的清理阶段先自动保存兜底。`saveRef` 不随表单卸载注销
   * （见 `DossierDetailForm`），此处仍能取到最后一笔草稿；清脏避免重复回写。
   */
  useEffect(() => {
    return () => {
      // 挂起的域内切换属于旧装配：不随模块变化残留，否则在新模块里点「保存」
      // 会拿新表单的 `saveNow` 去结算旧动作。
      clearPending()
      // 先判脏再落库（`flush` 自身也判脏），清脏必须放最后，否则兜底保存会被跳过。
      if (dirtyRef.current) void flush()
      reportDirty(false)
    }
  }, [active, bookId, clearPending, flush, reportDirty])

  // 对外成员名保持不变（别名映射），调用方零改动。
  return {
    dirty,
    reportDirty,
    flushDraft: flush,
    discardDraft,
    saveRef,
    switchPending: pending,
    resolveSwitch: resolve,
    guardSwitch: guard,
    confirming
  }
}
