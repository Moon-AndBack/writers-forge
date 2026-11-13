import { app } from 'electron'
import { logger } from '../logger'

/**
 * 数据库恢复成功后的重启安排。
 *
 * 先让 IPC 响应回到渲染层，再 `relaunch` + `exit`；本地恢复与 OneDrive 恢复共用。
 */

const log = logger.scope('backup:relaunch')

/** 默认延时：确保 IPC 响应先送达渲染层。 */
const DEFAULT_DELAY_MS = 300

/** 安排进程重启（调用后当前进程将在 `delayMs` 后退出）。 */
export function scheduleRelaunch(delayMs = DEFAULT_DELAY_MS): void {
  setTimeout(() => {
    log.info('数据库已恢复，重启应用')
    app.relaunch()
    app.exit(0)
  }, delayMs)
}
