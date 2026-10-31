import { app } from 'electron'
import { join } from 'node:path'
import log from 'electron-log/main'
// 仅引入无副作用、无 electron 依赖的纯脱敏工具，避免核心日志模块反向依赖业务逻辑。
import { safePath } from './onedrive/logSafe'

/**
 * 主进程统一日志。
 *
 * 方案：直接复用 electron-log 默认单例（`electron-log/main`，id = 'default'），
 * 不额外 `create()` 新实例——因为渲染进程经 `electron-log/renderer` 转发时，
 * IPC 消息只带 `logId: 'default'`，主进程默认实例才能接住并落盘；自建实例
 * 反而会收到消息但无对应 logger。故此处导出该单例并统一配置。
 *
 * 落盘路径：显式固定为 `app.getPath('userData')/logs/main.log`（跨平台一致，
 * 不采用 electron-log 在 macOS 上的 `~/Library/Logs` 默认值）。
 *
 * 崩溃捕获：使用 electron-log 内置的 `errorHandler`（uncaughtException /
 * unhandledRejection）与 `eventLogger`（render-process-gone / child-process-gone
 * 等 Electron 事件），不再手写重复的 process/app 监听，避免同一异常双写。
 */

/** 文件行格式：时间戳 + 级别 + 进程标记（main / renderer）+ scope + 正文。 */
const FILE_FORMAT = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}]{scope} {text}'

/** 控制台行格式：与文件对齐，省略日期。 */
const CONSOLE_FORMAT = '[{h}:{i}:{s}.{ms}] [{level}] [{processType}]{scope} › {text}'

/** 单个日志文件上限 5 MiB；超出后由默认 archiveLogFn 轮转为 `main.old.log`（仅保留 1 份旧档）。 */
const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024

let initialized = false

/**
 * 初始化并配置日志系统（幂等）。
 *
 * 调用时机约束：必须在 `configureAppPaths()` **之后**（这样 `userData` 已被
 * 固定为「Writer's Forge」/「Writer's Forge Dev」），且在任何 `getDb()` 之前。
 * 本函数是首次读取 `app.getPath('userData')` 的地方，读取到的即最终路径。
 */
export function configureLogger(): void {
  if (initialized) return
  initialized = true

  const isDev = !app.isPackaged
  const userDataDir = app.getPath('userData')
  const logsDir = join(userDataDir, 'logs')

  // ---- 文件传输 ----
  // 显式指定落盘路径，覆盖 electron-log 的平台默认（macOS 会落到 ~/Library/Logs）。
  log.transports.file.resolvePathFn = () => join(logsDir, 'main.log')
  // 生产仅 info 及以上；开发放开到 debug，便于排查。
  log.transports.file.level = isDev ? 'debug' : 'info'
  // 大小上限 + 轮转：默认 archiveLogFn 会把旧文件同步重命名为 main.old.log（保留 1 份）。
  log.transports.file.maxSize = MAX_LOG_FILE_SIZE
  log.transports.file.format = FILE_FORMAT

  // ---- 控制台传输 ----
  // 开发全开；生产仅 warn / error，避免刷屏（仍保留最基本可见性）。
  log.transports.console.level = isDev ? 'debug' : 'warn'
  log.transports.console.format = CONSOLE_FORMAT

  // ---- 主进程 → 渲染进程 DevTools 的 IPC 传输：仅开发开启 ----
  log.transports.ipc.level = isDev ? 'debug' : false

  // ---- 渲染进程转发桥：注入内置 preload（须在窗口创建前调用）----
  // 使 `electron-log/renderer` 的日志经 __ELECTRON_LOG__ 通道自动转发到主进程落盘。
  log.initialize()

  // ---- 未捕获异常 / 未处理 Promise 拒绝：落盘（不弹窗，避免引入新的 UI 行为）----
  log.errorHandler.startCatching({ showDialog: false })

  // ---- Electron 关键事件：崩溃 / 子进程退出 / 加载失败等落盘 ----
  // 显式给出事件清单（覆盖默认值），关闭证书错误这类与崩溃无关的噪声。
  log.eventLogger.startLogging({
    level: 'error',
    events: {
      app: {
        'certificate-error': false,
        'child-process-gone': true,
        'render-process-gone': true
      },
      webContents: {
        'did-fail-load': true,
        'did-fail-provisional-load': true,
        'plugin-crashed': true,
        'preload-error': true,
        unresponsive: true
      }
    }
  })

  // 只记目录名，不记绝对路径（后者含系统用户名等 PII）。
  log.info('[app] 日志系统已就绪', {
    userDataDir: safePath(userDataDir),
    logsDir: safePath(logsDir),
    level: isDev ? 'debug' : 'info'
  })
}

/** 主进程日志单例（即 electron-log 默认实例）。 */
export const logger = log
