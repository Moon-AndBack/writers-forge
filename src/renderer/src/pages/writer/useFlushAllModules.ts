import { useCallback, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createLogger } from '@renderer/lib/log'
import { isDossierModule } from '../../shell/activityBarModules'
import type { WriterModule } from '../../shell/activityBarModules'

/** 关闭前统一保存日志（转发至主进程落盘）。 */
const log = createLogger('beforeCloseFlush')

export interface FlushAllModulesOptions {
  /** 章节正文立即落盘入口（`ChaptersView` 挂载时写入）。 */
  chapterFlushRef: RefObject<(() => Promise<void>) | null>
  /** 大纲正文立即落盘入口（`OutlineEditor` 挂载时写入）。 */
  outlineFlushRef: RefObject<(() => Promise<void>) | null>
  /** 剧情右栏表单保存入口（`usePlotWorkspace` 的 `saveRef`；返回是否落库成功）。 */
  plotSaveRef: RefObject<(() => void | Promise<boolean>) | null>
  /** 设定档案草稿落库入口（`dossierBundle.saveDraft`；无装配包时为 null）。 */
  saveDossierDraft: (() => Promise<boolean>) | null
  /** 伏笔草稿落库入口（`foreshadowBundle.saveDraft`；无装配包时为 null）。 */
  saveForeshadowDraft: (() => Promise<boolean>) | null
  /** 灵感草稿落库入口（`inspirationBundle.saveDraft`；无装配包时为 null）。 */
  saveInspirationDraft: (() => Promise<boolean>) | null
  /** 时间线起点描述草稿补存入口（右栏起点卡挂载时写入；无脏内容为空操作）。 */
  timelineFlushRef?: RefObject<(() => Promise<void>) | null>
}

/** 单个模块的落库步骤：`match` 判定归属模块，`run` 执行写入。 */
interface FlushStep {
  /** 步骤标识（兼作在途去重键，须全局唯一）。 */
  name: string
  /** 该步骤负责的模块（设定档案一项覆盖五域）。 */
  match: (module: WriterModule) => boolean
  /** 落库入口；返回 `false` 表示真实失败，其余（undefined / 无返回值）按成功。 */
  run: () => void | Promise<unknown>
}

export interface FlushAllModulesResult {
  /** 依次落库全部模块（关闭前调用）；整体恒 resolve，单个失败不阻断后续。 */
  flushAll: () => Promise<void>
  /**
   * 只落库目标模块：返回真实成败（剧情 / 设定档案）；无匹配步骤时返回 `true`。
   * 章节 / 大纲的落盘入口是 `Promise<void>`（恒按成功处理，失败由各自
   * `status='error'` 体现），因此其返回值不代表写入成功。
   */
  flushModule: (module: WriterModule) => Promise<boolean>
}

/**
 * 写作页「关闭前统一 flush」聚合：依次 await 各模块把未落库内容写入数据库。
 *
 * 顺序：章节正文 → 大纲正文 → 剧情场景草稿 → 设定档案草稿 → 伏笔草稿 → 灵感草稿 →
 * 时间线起点描述草稿。串行（而非并发）是为了
 * 贴合各模块既有的写链语义（同一模块内的写请求本就串行），且失败定位更清晰。
 * **单个模块失败不阻断其它模块**：逐项 try/catch，仅记日志；整体 promise 恒 resolve
 * （外壳侧无需再兜 rejection，也不会因某个模块抛错卡住关闭流程）。
 *
 * 各模块未挂载 / 无脏内容时其入口为空操作（`ref.current === null`、脏态为净），
 * 因此本函数可无条件调用；不改变既有保存语义（防抖时间 / 手动保存按钮均不动）。
 *
 * 另一入口 `flushModule` 供模块切换使用（T28 章节 / 大纲切换前强制落库）。
 * 两条入口共享同一份在途表：同一模块正在写库时复用同一个 promise，避免
 * 「切换 flush / 关窗 flushAll / 800ms 防抖」并发写同一域。
 */
export function useFlushAllModules({
  chapterFlushRef,
  outlineFlushRef,
  plotSaveRef,
  saveDossierDraft,
  saveForeshadowDraft,
  saveInspirationDraft,
  timelineFlushRef
}: FlushAllModulesOptions): FlushAllModulesResult {
  // 在途步骤：按步骤名复用 promise（步骤名与域一一对应，故等价于按域去重）。
  const inFlightRef = useRef(new Map<string, Promise<boolean>>())

  const steps = useMemo<FlushStep[]>(
    () => [
      {
        name: '章节正文',
        match: (module) => module === 'chapters',
        run: () => chapterFlushRef.current?.()
      },
      {
        name: '大纲正文',
        match: (module) => module === 'outline',
        run: () => outlineFlushRef.current?.()
      },
      {
        name: '剧情场景',
        match: (module) => module === 'plot',
        run: () => plotSaveRef.current?.()
      },
      {
        name: '设定档案',
        match: (module) => isDossierModule(module),
        run: () => saveDossierDraft?.()
      },
      {
        name: '伏笔',
        match: (module) => module === 'foreshadow',
        run: () => saveForeshadowDraft?.()
      },
      {
        name: '灵感',
        match: (module) => module === 'inspiration',
        run: () => saveInspirationDraft?.()
      },
      {
        name: '时间线起点描述',
        match: (module) => module === 'timeline',
        run: () => timelineFlushRef?.current?.()
      }
    ],
    [
      chapterFlushRef,
      outlineFlushRef,
      plotSaveRef,
      saveDossierDraft,
      saveForeshadowDraft,
      saveInspirationDraft,
      timelineFlushRef
    ]
  )

  /**
   * 执行单个步骤：在途复用 → 否则新建任务并登记。
   * `finally` 先于 promise 结算删除登记，调用方等待到的即是本轮写入结果。
   */
  const runStep = useCallback(async (step: FlushStep): Promise<boolean> => {
    const inFlight = inFlightRef.current.get(step.name)
    if (inFlight) return inFlight

    const task = (async (): Promise<boolean> => {
      try {
        const result = await step.run()
        return result !== false
      } catch (error) {
        log.warn(`${step.name}保存失败（已跳过）`, error)
        return false
      } finally {
        inFlightRef.current.delete(step.name)
      }
    })()

    inFlightRef.current.set(step.name, task)
    return task
  }, [])

  const flushAll = useCallback(async (): Promise<void> => {
    for (const step of steps) {
      await runStep(step)
    }
  }, [steps, runStep])

  const flushModule = useCallback(
    async (module: WriterModule): Promise<boolean> => {
      const matched = steps.filter((step) => step.match(module))
      if (matched.length === 0) return true

      let ok = true
      for (const step of matched) {
        // 不短路：多个步骤（当前无，留扩展）也要各自落库，失败仅汇总结果。
        const result = await runStep(step)
        ok = result && ok
      }
      return ok
    },
    [steps, runStep]
  )

  return useMemo(() => ({ flushAll, flushModule }), [flushAll, flushModule])
}
