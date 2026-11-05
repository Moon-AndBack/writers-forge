import { useCallback, useState } from 'react'
import type { WriterModule } from '../../shell/activityBarModules'
import { isDossierModule } from '../../shell/activityBarModules'
import { useUnsavedGuard } from '../../shell/useUnsavedGuard'
import type { DossierBundle } from './dossier/dossierTree'
import type { ForeshadowBundle } from './foreshadow/foreshadowTree'
import type { InspirationBundle } from './inspiration/inspirationTree'

/** 剧情域参与切换守卫所需的最小面（避免把整份装配对象塞进依赖）。 */
export interface PlotSwitchSource {
  /** 剧情右栏草稿是否有未保存改动。 */
  dirty: boolean
  /** 放弃剧情草稿（清脏 + 右栏表单重挂回场景行值）。 */
  discardDraft: () => void
}

export interface WriterModuleSwitchOptions {
  /** 当前活动模块（外壳活动栏真源）。 */
  active: WriterModule
  /** 切换模块（外壳活动栏 setter）。 */
  setActive: (module: WriterModule) => void
  /** 剧情域脏态 / 放弃入口。 */
  plot: PlotSwitchSource
  /** 设定档案装配包（仅五域之一时非空）。 */
  dossier: DossierBundle | null
  /** 伏笔装配包（仅活动模块为伏笔时非空）。 */
  foreshadow: ForeshadowBundle | null
  /** 灵感装配包（仅活动模块为灵感时非空）。 */
  inspiration: InspirationBundle | null
  /** 单模块落库（`useFlushAllModules` 的 `flushModule`；返回真实成败）。 */
  flushModule: (module: WriterModule) => Promise<boolean>
  /** 保存失败回调（脏保留、不切换；由页面层弹提示）。 */
  onSaveFailed?: () => void
}

export interface WriterModuleSwitch {
  /** 切换入口（外壳 `useRequestSwitch` 转发至此）。 */
  handleSwitch: (target: WriterModule) => void
  /** 挂起的目标模块（null = 无待确认切换）。 */
  pendingModule: WriterModule | null
  /** 保存结算中（确认框据此禁用按钮）。 */
  confirming: boolean
  /** 「保存并切换」：失败不切换、脏保留，并清空目标（由 `onSaveFailed` 提示）。 */
  saveAndSwitch: () => Promise<void>
  /** 「放弃并切换」：丢弃当前模块草稿后切换。 */
  discardAndSwitch: () => void
}

/**
 * 模块切换未保存守卫：把「五域 / 剧情 / 伏笔 / 灵感」的脏态统一接到通用 `useUnsavedGuard`，
 * 供写作页活动栏切换时裁决（同一 hook 实例、同一份挂起动作）。
 *
 * 脏态**只取当前活动模块**：五域取设定档案包，剧情取 `plot.dirty`，伏笔 / 灵感取各自
 * 装配包的 `dirty`，其余模块恒净。
 * 不得用 `plot.dirty || dossierDirty` —— 剧情草稿可能在切到章节模块后仍残留脏态，
 * 那样会在章节模块误弹确认框（章节本身没有手动草稿可丢）。
 */
export function useWriterModuleSwitch({
  active,
  setActive,
  plot,
  dossier,
  foreshadow,
  inspiration,
  flushModule,
  onSaveFailed
}: WriterModuleSwitchOptions): WriterModuleSwitch {
  const [pendingModule, setPendingModule] = useState<WriterModule | null>(null)
  const { dirty: plotDirty, discardDraft: discardPlotDraft } = plot

  const activeDirty = isDossierModule(active)
    ? (dossier?.dirty ?? false)
    : active === 'plot'
      ? plotDirty
      : active === 'foreshadow'
        ? (foreshadow?.dirty ?? false)
        : active === 'inspiration'
          ? (inspiration?.dirty ?? false)
          : false

  const save = useCallback((): Promise<boolean> => flushModule(active), [flushModule, active])

  const discard = useCallback((): void => {
    if (isDossierModule(active)) {
      dossier?.discardDraft()
      return
    }
    if (active === 'plot') {
      discardPlotDraft()
      return
    }
    if (active === 'foreshadow') foreshadow?.discardDraft()
    else if (active === 'inspiration') inspiration?.discardDraft()
  }, [active, dossier, discardPlotDraft, foreshadow, inspiration])

  const { guard, confirming, resolve } = useUnsavedGuard({
    dirty: activeDirty,
    save,
    discard
  })

  const handleSwitch = useCallback(
    (target: WriterModule): void => {
      // 同模块：没有「切换」动作，不打扰用户。
      if (target === active) return

      if (active === 'chapters' || active === 'outline') {
        // T28：章节 / 大纲正文没有可判的脏态，切走前强制落库以缩短 800ms 防抖窗口。
        // 不 await：两视图在 `EditorPane` 中常驻挂载（只切 `is-active`，不卸载），
        // `setActive` 不会打断写入；`useRequestSwitch` 本身也不 await，现有切章 /
        // 切条目同样是 `void flush()`，此处保持一致。
        void flushModule(active)
        setActive(target)
        return
      }

      const immediate = guard(() => setActive(target))
      // 挂起时保留第一个目标：结算期间再次点其它模块不得改写用户正在处理的动作。
      if (!immediate) setPendingModule((current) => current ?? target)
    },
    [active, setActive, guard, flushModule]
  )

  const saveAndSwitch = useCallback(async (): Promise<void> => {
    // 保存结算中 / 无挂起目标：忽略（ConfirmDialog 已禁用按钮，此处兜底）。
    if (pendingModule === null || confirming) return

    const ok = await resolve(true)
    // `resolve` 失败时已 clearPending；两种结局都关框：成功已切换，失败保留脏可重试。
    setPendingModule(null)
    if (!ok) onSaveFailed?.()
  }, [pendingModule, confirming, resolve, onSaveFailed])

  const discardAndSwitch = useCallback((): void => {
    if (pendingModule === null || confirming) return
    void resolve(false)
    setPendingModule(null)
  }, [pendingModule, confirming, resolve])

  return {
    handleSwitch,
    pendingModule,
    confirming,
    saveAndSwitch,
    discardAndSwitch
  }
}
