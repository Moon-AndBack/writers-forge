import { DiagnosticsDialog } from './DiagnosticsDialog'
import { useDiagnostics } from './useDiagnostics'

/**
 * 数据健康自检挂载点：拉取报告，仅在发现问题时渲染 {@link DiagnosticsDialog}。
 *
 * 挂在应用根组件 `App` 内（Provider 层之后、路由之外），故**任意路由下都会提示**；
 * 无问题（`clean`）/ 无接口 / 读取失败时渲染 `null`，正常启动零 UI 变化。
 */
export function DiagnosticsGate() {
  const { report, dismiss } = useDiagnostics()

  if (!report) return null
  return <DiagnosticsDialog report={report} onClose={dismiss} />
}

export default DiagnosticsGate
