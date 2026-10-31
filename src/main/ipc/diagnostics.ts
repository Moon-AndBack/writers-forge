import { ipcMain } from 'electron'
import { logger } from '../logger'
import type { DiagnosticsReport } from '../database/diagnostics'

/** 自检域日志 scope。 */
const log = logger.scope('diagnostics')

/**
 * 数据健康自检域 IPC：通道 `diagnostics:get`。
 *
 * 报告由主进程在启动时（`getDb()` 之后、窗口创建之前）跑一次并**存内存**
 * （`src/main/index.ts`），此处仅作只读回传——与 `settings:get` 同构：渲染层启动时
 * 拉一次，无推送、无竞态、不持久化「已忽略」（每次启动都重新检查并提示）。
 */
export function registerDiagnosticsIpc(report: DiagnosticsReport): void {
  ipcMain.handle('diagnostics:get', () => {
    log.debug('diagnostics:get', { status: report.status, issueCount: report.issues.length })
    return report
  })
}
