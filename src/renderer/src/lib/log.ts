import log from 'electron-log/renderer'

/**
 * 渲染进程日志薄封装。
 *
 * 底层用 electron-log 的渲染进程入口：它并不直接写文件，而是把日志经
 * `__ELECTRON_LOG__` IPC 通道转发到主进程，由主进程统一落盘到
 * `userData/logs/main.log`（主进程侧 `log.initialize()` 注入的 preload 提供
 * `window.__electronLog`）。渲染进程全程不触碰文件系统。
 *
 * 封装目的：统一 scope 前缀，避免各处重复书写 `console`/scope 逻辑。
 * scope 最终由 electron-log 格式化为 `(scope)` 附加在行内。
 */
export function createLogger(scope: string): {
  error: (...params: unknown[]) => void
  warn: (...params: unknown[]) => void
  info: (...params: unknown[]) => void
  debug: (...params: unknown[]) => void
} {
  return log.scope(scope)
}
