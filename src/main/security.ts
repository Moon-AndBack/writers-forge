import { session, type BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { logger } from './logger'

/** 安全域日志 scope。 */
const log = logger.scope('security')

/**
 * 生产环境 Content-Security-Policy（以响应头注入，见 `installContentSecurityPolicy`）。
 *
 * 逐项依据：
 * - `default-src 'self'`：兜底只允许应用自身来源（打包后即 `file://` 下的产物文件）。
 * - `script-src 'self'`：不放开 `unsafe-inline` / `unsafe-eval`；Vite 产物脚本均为独立文件。
 * - `style-src 'self' 'unsafe-inline'`：React 内联 `style` 属性（如 `RightPane` 的分栏宽度、
 *   `TableContextMenu` 的定位）与 Tiptap / ProseMirror 运行期写入的行内样式大量存在，
 *   去掉 `unsafe-inline` 会大面积丢样式；产物 CSS 本身仍走 `'self'`。
 * - `img-src 'self' data: blob:`：三类来源——产物内图片（self）、封面 / 预览的 data URL、
 *   `images:get` 拉取后经 `URL.createObjectURL` 生成的 blob URL。
 *   额外放行 `https:` / `http:`：大纲正文支持「外链图」，`imageNode.ts` 的 `externalImageContent`
 *   把 http(s) URL 直接作为 `<img src>`（见 `ImageNodeView.tsx`），不放行会全部裂图。
 *   其中 `http:` 为既有功能契约（`isHttpUrl` 同时接受 http/https），仅影响图片加载、
 *   不能执行脚本；如需收紧为 https-only，需先改渲染层校验（本次不在改动范围）。
 * - `font-src 'self' data:`：字体为随包落位的 ttf（`styles/fonts.css`），不加载网络字体。
 * - `connect-src 'self'`：渲染层不直接发网络请求——AI（`main/ai`）与 OneDrive
 *   （`main/onedrive`）的 fetch 全在主进程，CSP 不约束主进程，故无需放行外域。
 * - `object-src 'none'` / `base-uri 'none'` / `frame-ancestors 'none'`：禁用插件对象、
 *   `<base>` 劫持，并禁止页面被嵌入（Electron 窗口本身不应被 frame）。
 */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'"
].join('; ')

/** 打包后的渲染入口（与 `createMainWindow` 的 `loadFile` 目标一致）。 */
const RENDERER_ENTRY = pathToFileURL(join(__dirname, '../renderer/index.html'))

/** CSP 是否已注册：session 级监听只能挂一次，macOS 重建窗口不重复挂钩。 */
let cspInstalled = false

/**
 * 为 `session.defaultSession` 的所有响应注入 CSP 响应头（**仅生产**调用）。
 *
 * 为何用响应头而非 `index.html` 的 `<meta>`：`<meta>` 无法区分环境，会一并作用于开发模式，
 * 而 electron-vite HMR 依赖 ws 连接与内联脚本，静态策略会直接阻断热更新。
 * 因此开发模式不调用本函数，由 `createMainWindow` 的 dev / prod 分支保证。
 */
export function installContentSecurityPolicy(): void {
  if (cspInstalled) return
  cspInstalled = true

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders ?? {}),
        'Content-Security-Policy': [PRODUCTION_CSP]
      }
    })
  })

  log.info('生产 CSP 已挂载', { policy: PRODUCTION_CSP })
}

/**
 * 安装导航守卫：只放行应用自身来源，其余导航一律拦截。
 *
 * - 开发：放行与 dev server 同源（scheme + host + port）的导航，兼容 HMR 整页刷新。
 * - 生产：只放行打包入口 `file://…/renderer/index.html` 本身。
 *
 * 新窗口已由 `setWindowOpenHandler` 统一 `deny` 并转系统浏览器，此处只兜住
 * 「当前窗口被导航走」这一路径（渲染层不存在无 `target` 的外链，正常场景无感知）。
 */
export function installNavigationGuards(win: BrowserWindow, rendererUrl: string | undefined): void {
  win.webContents.on('will-navigate', (event, targetUrl) => {
    if (isAppNavigation(targetUrl, rendererUrl)) return

    event.preventDefault()
    log.warn('已拦截应用内导航', { targetUrl })
  })
}

/** 判定目标 URL 是否属于应用自身来源（dev server 源或打包入口）。 */
function isAppNavigation(targetUrl: string, rendererUrl: string | undefined): boolean {
  try {
    const target = new URL(targetUrl)

    if (rendererUrl) {
      return target.origin === new URL(rendererUrl).origin
    }

    if (target.protocol !== 'file:') return false
    return normalizePathname(target.pathname) === normalizePathname(RENDERER_ENTRY.pathname)
  } catch {
    // 非法 URL（空串 / 畸形）一律不放行
    return false
  }
}

/** 文件路径比较前归一：percent-decode，且 Windows 路径大小写不敏感。 */
function normalizePathname(pathname: string): string {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // 解码失败说明不是合法路径，保留原值即可（比较时自然不等）
  }
  return process.platform === 'win32' ? decoded.toLowerCase() : decoded
}
