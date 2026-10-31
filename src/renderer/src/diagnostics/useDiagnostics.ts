import { useCallback, useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'

/** 自检链路日志（转发至主进程落盘）。 */
const log = createLogger('diagnostics')

/**
 * 自检报告：**直接从 preload `Api` 派生**（`diagnostics:get` 出参），消除渲染层平行定义。
 * `issues[number].code` 为字面量联合，据此以模板字面量精确映射 i18n key。
 */
export type DiagnosticsReport = Awaited<ReturnType<Window['api']['diagnostics']['get']>>

export interface UseDiagnosticsResult {
  /** 存在**问题**时的报告；无问题（`clean`）/ 无接口 / 读取失败时为 `null`。 */
  report: DiagnosticsReport | null
  /** 关闭弹窗（**不持久化**，下次启动仍会重新检查并提示）。 */
  dismiss: () => void
}

/**
 * 启动时拉取一次数据自检报告（主进程在 `getDb()` 后已同步跑完并存内存，无竞态）。
 *
 * 设计要点：
 * - 只有 `status === 'problems'` 且确有 issue 时才对外暴露报告 → 正常库不产生任何 UI；
 * - **不持久化「已忽略」**：每次启动都重新拉取，这是数据健康警告的正确行为；
 * - 无 `window.api.diagnostics`（纯浏览器预览）或读取失败时静默跳过，不阻塞应用。
 */
export function useDiagnostics(): UseDiagnosticsResult {
  const [report, setReport] = useState<DiagnosticsReport | null>(null)

  useEffect(() => {
    const api = window.api?.diagnostics
    if (!api) return

    let active = true
    api
      .get()
      .then((value) => {
        if (!active) return
        if (value.status === 'problems' && value.issues.length > 0) {
          log.warn('数据自检发现问题', { count: value.issues.length })
          setReport(value)
        }
      })
      .catch((error) => {
        log.error('自检报告获取失败', error)
      })

    return () => {
      active = false
    }
  }, [])

  const dismiss = useCallback(() => setReport(null), [])

  return { report, dismiss }
}

export default useDiagnostics
