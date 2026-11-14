import { createLogger } from './log'

/**
 * 渲染层全局错误监听（只落盘，不弹提示）。
 *
 * 错误边界只能捕获 React 渲染 / 生命周期内的异常；事件处理器、定时器、
 * Promise 回调里抛出的错误会绕过组件树。这里在 `window` 上补两层监听，
 * 统一经 `electron-log/renderer` 转发到主进程日志（`userData/logs/main.log`）。
 *
 * 不弹 Toast：错误风暴（同一异常每帧触发）时弹层会刷屏，日志足够定位。
 */
const logger = createLogger('globalError')

/** 模块级标志：HMR 重载 / 重复调用时不叠加监听。 */
let registered = false

function handleWindowError(event: ErrorEvent): void {
  const error = event.error instanceof Error ? event.error : null
  logger.error('未捕获的窗口错误', {
    message: error?.message ?? event.message,
    stack: error?.stack,
    reason: event.error,
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno
  })
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const error = event.reason instanceof Error ? event.reason : null
  logger.error('未处理的 Promise 拒绝', {
    message: error?.message ?? String(event.reason),
    stack: error?.stack,
    reason: event.reason
  })
}

/**
 * 注册窗口级错误监听（幂等）。应在 `main.tsx` 模块顶层、`bootstrap()` 之前调用，
 * 使启动阶段的异常（如设置读取 / i18n 初始化失败）同样能写入日志。
 */
export function registerGlobalErrorHandlers(): void {
  if (registered) return
  registered = true
  window.addEventListener('error', handleWindowError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
}

/* 开发态 HMR：模块被替换前先摘掉监听，避免旧处理器残留导致同一条错误重复记录。 */
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener('error', handleWindowError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    registered = false
  })
}
