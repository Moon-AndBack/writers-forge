import { app, BrowserWindow, shell, type Input } from 'electron'
import { join } from 'node:path'
import { logger } from './logger'
import { installContentSecurityPolicy, installNavigationGuards } from './security'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  readInitialWindowSize,
  registerWindowSizePersistence
} from './windowState'
import { readInitialWindowMaterial, resolveMaterial } from './windowMaterial'

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
  const initialMaterial = resolveMaterial(readInitialWindowMaterial())
  const acrylicEnabled = initialMaterial === 'acrylic'

  // 应用图标：开发态取仓库内 build/icon.png；打包态取 extraResources 投放的 icon.png。
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
    // 开启 Acrylic 时窗口底全透明（透出 DWM 材质）；关闭时不透明，取近白中性色 #f3f3f3
    // 避免创建瞬间黑闪。用 backgroundColor 的 alpha 通道而非 transparent:true，
    // 规避后者在 Windows 上「无法缩放 / 无阴影」等副作用。
    backgroundColor: acrylicEnabled ? '#00000000' : '#f3f3f3',
    backgroundMaterial: initialMaterial,
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

  // 持久化非最大化窗口尺寸（resize 防抖写库，close 补写）
  registerWindowSizePersistence(mainWindow)

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
