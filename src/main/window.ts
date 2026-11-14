import { app, BrowserWindow, ipcMain, shell, type Input, type IpcMainEvent } from 'electron'
import { join } from 'node:path'
import { logger } from './logger'
import { installContentSecurityPolicy, installNavigationGuards } from './security'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  readInitialWindowSize,
  registerWindowSizePersistence
} from './windowState'
import {
  readInitialWindowMaterial,
  rememberInitialWindowMaterial,
  resolveDwmMaterial,
  resolveMaterial
} from './windowMaterial'

/** 窗口域日志 scope。 */
const log = logger.scope('window')

/**
 * 判断输入是否为「切换开发者工具」快捷键：
 * - Windows / Linux：`F12`，或 `Ctrl+Shift+I`；
 * - macOS：`F12`，或 `Cmd+Option+I`（`meta` + `alt`）。
 *
 * 依据 Electron `Input` 的 `key` 与修饰键判定；仅命中时返回 true，
 * 由调用方决定是否 `preventDefault`，不影响其它按键 / 输入。
 */
function isToggleDevToolsInput(input: Input): boolean {
  if (input.key === 'F12') return true

  const wantsInspectKey = input.key.toLowerCase() === 'i'
  if (!wantsInspectKey) return false

  const isMacLike = process.platform === 'darwin'
  return isMacLike ? input.meta && input.alt && !input.control : input.control && input.shift
}

/**
 * 仅开发模式下注册 DevTools 切换快捷键（`F12` / `Ctrl+Shift+I`，macOS 为 `Cmd+Option+I`）。
 *
 * 生产（打包）模式不注册，避免暴露开发者工具入口。
 */
function registerDevToolsShortcut(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (!isToggleDevToolsInput(input)) return

    event.preventDefault()
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools()
    } else {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })
}

/** 关窗时等待渲染层落盘回执的上限（ms）；超时强制关闭，避免窗口关不掉。 */
const BEFORE_CLOSE_TIMEOUT_MS = 3000

/** 主进程 → 渲染层：「即将关闭，请统一落盘」。 */
const BEFORE_CLOSE_CHANNEL = 'app:before-close'

/** 渲染层 → 主进程：「落盘完成，可以关闭」。 */
const CLOSE_READY_CHANNEL = 'app:close-ready'

/**
 * 关窗前等待渲染层落盘：拦截首次 `close` → 通知渲染层 → 等回执 / 3 秒超时 → 真正关闭。
 *
 * 状态机：
 * - 首次 close：`preventDefault`，置 `closePending`，注册回执监听 + 超时定时器，发通知；
 * - 回执（且 sender 为本窗口）：清理监听 / 定时器，置 `allowClose` 后 `close()` 放行；
 * - 超时：清理监听 / 定时器后 `destroy()`，保证窗口一定关得掉；
 * - 期间重复点关闭：`closePending` 为真，只 `preventDefault`，不重复发通知；
 * - 窗口 / webContents 已销毁：直接放行（不拦截）。
 *
 * 回执用 `ipcMain.on` 读取 `event.sender` 精确比对，而非 `once`——`once` 会被
 * 其它窗口（未来多窗口 / 异常 sender）的首条消息消耗掉，导致本窗口只能等超时。
 */
function registerCloseFlushGate(win: BrowserWindow): void {
  const contents = win.webContents
  let allowClose = false
  let closePending = false
  let timer: NodeJS.Timeout | null = null

  const cleanup = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    ipcMain.removeListener(CLOSE_READY_CHANNEL, onCloseReady)
  }

  /** 收到回执：放行 close（仍走 windowState 的尺寸补写等既有 close 监听）。 */
  const finishClose = (): void => {
    cleanup()
    closePending = false
    allowClose = true
    if (!win.isDestroyed()) win.close()
  }

  function onCloseReady(event: IpcMainEvent): void {
    // 只受理本窗口的回执，其它来源一律忽略（监听保留，继续等本窗口）。
    if (event.sender !== contents) return
    finishClose()
  }

  win.on('close', (event) => {
    if (allowClose || win.isDestroyed() || contents.isDestroyed()) return

    event.preventDefault()
    if (closePending) return

    closePending = true
    ipcMain.on(CLOSE_READY_CHANNEL, onCloseReady)
    timer = setTimeout(() => {
      log.warn('等待渲染层落盘超时，强制关闭窗口', { timeoutMs: BEFORE_CLOSE_TIMEOUT_MS })
      cleanup()
      closePending = false
      allowClose = true
      if (!win.isDestroyed()) win.destroy()
    }, BEFORE_CLOSE_TIMEOUT_MS)

    try {
      contents.send(BEFORE_CLOSE_CHANNEL)
    } catch (error) {
      // 发送失败（渲染进程异常）不阻塞关闭：直接走放行路径。
      log.warn('通知渲染层关闭前落盘失败，直接关闭窗口', error)
      finishClose()
    }
  })

  // 兜底清理：任何路径关窗（含外部 destroy）都不留下挂在 ipcMain 上的监听 / 定时器。
  win.once('closed', cleanup)
}

/**
 * 创建主窗口。
 *
 * 默认 / 最小尺寸（外框 DIP）见 `windowState.ts` 的 `DEFAULT_WINDOW_WIDTH/HEIGHT`：
 * 宽度恰好放下 4 张书卡（4×200 + 3×18 列间距 + 页面/网格内边距 + 12 滚动条 = 902）；
 * 高度为 1.5 行卡片 + chrome（42 标题栏 + 36 状态栏 + 工具条 + 内边距 + 400 卡 + 14 行距
 * + 200 半排 ≈ 764）。已由无头浏览器 + 真实 Electron 探针实测校准。
 */
export function createMainWindow(): BrowserWindow {
  const initialSize = readInitialWindowSize()

  // 启动时读取持久化的窗口材质并解析实际可生效值（非 Windows 11 22H2+ 降级 none）。
  // 云母再按当前应用明暗解析为 DWM 的 Mica Alt（浅色）或标准 Mica（深色）。
  const initialSelection = readInitialWindowMaterial()
  const initialMaterial = resolveMaterial(initialSelection)
  const materialEnabled = initialMaterial !== 'none'

  // 应用图标：开发态取仓库内 build/icon.png；打包态取 extraResources 投放的 icon.png。
  // 文件内容恒定 256×256（文件名不再带尺寸后缀）：Electron 在 new BrowserWindow() 构造期
  // 会同步把图标解码成 Windows HICON（尺寸上限 256），256² 约 3ms，无大图解码开销。
  // （electron-builder 同时以 build/icon.ico 内嵌 exe 图标，保证标题栏 / 任务栏一致。）
  const windowIcon = app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../build/icon.png')

  const mainWindow = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    minWidth: DEFAULT_WINDOW_WIDTH,
    minHeight: DEFAULT_WINDOW_HEIGHT,
    show: false,
    icon: windowIcon,
    // 材质开启时设置 backgroundColor: '#00000000'（关闭时 #f3f3f3 避免创建瞬间黑闪）。
    // Electron 文档说明 #AARRGGBB 的 alpha 仅在 transparent:true 时生效；本应用因 transparent
    // 在 Windows 上的副作用（缩放 / 阴影 / Snap / 窗口按钮）未开启，材质可见性以实机为准。
    backgroundColor: materialEnabled ? '#00000000' : '#f3f3f3',
    backgroundMaterial: resolveDwmMaterial(initialMaterial),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#5c5c5c',
      height: 42
    },
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  // 登记建窗时已应用的材质，供主题明暗变化时判断是否需要重新下发 DWM 材质
  rememberInitialWindowMaterial(mainWindow, initialSelection)

  // 持久化非最大化窗口尺寸（resize 防抖写库，close 补写）
  registerWindowSizePersistence(mainWindow)

  // 关窗前先等渲染层统一落盘（与上面的尺寸补写监听共存：先补写尺寸，再拦截关闭）
  registerCloseFlushGate(mainWindow)

  log.info('主窗口已创建', {
    width: initialSize.width,
    height: initialSize.height,
    material: initialMaterial
  })

  mainWindow.on('ready-to-show', () => {
    log.debug('窗口 ready-to-show，显示主窗口')
    mainWindow.show()
  })

  // 外链一律交给系统浏览器，禁止在应用内新开窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  // 开发模式判定沿用本项目惯例：electron-vite dev 注入 ELECTRON_RENDERER_URL；
  // 生产（打包）走 loadFile 分支，此时不注册 DevTools 快捷键，避免暴露入口。
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']

  // 导航守卫：只允许应用自身来源（dev server 源 / 打包入口），其余一律拦截（见 security.ts）
  installNavigationGuards(mainWindow, rendererUrl)

  if (rendererUrl) {
    registerDevToolsShortcut(mainWindow)
    void mainWindow.loadURL(rendererUrl)
  } else {
    // 生产 CSP：响应头注入（仅生产，避免阻断开发态 HMR 的 ws / 内联脚本）
    installContentSecurityPolicy()
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
