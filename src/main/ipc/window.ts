import {
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
  type TitleBarOverlayOptions
} from 'electron'
import { logger } from '../logger'
import {
  applyWindowMaterial,
  isMaterialSupported,
  normalizeWindowMaterial
} from '../windowMaterial'

/** 窗口域日志 scope。 */
const log = logger.scope('windowIpc')

/** 校验渲染层传入的标题栏 overlay 参数，非法返回 null */
function parseOverlayOptions(value: unknown): TitleBarOverlayOptions | null {
  if (typeof value !== 'object' || value === null) return null

  const { color, symbolColor, height } = value as TitleBarOverlayOptions
  const options: TitleBarOverlayOptions = {}

  if (color !== undefined) {
    if (typeof color !== 'string') return null
    options.color = color
  }
  if (symbolColor !== undefined) {
    if (typeof symbolColor !== 'string') return null
    options.symbolColor = symbolColor
  }
  if (height !== undefined) {
    if (typeof height !== 'number' || !Number.isFinite(height)) return null
    options.height = height
  }

  return options
}

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowIpc(): void {
  ipcMain.handle('window:titlebar:set-overlay', (event, options: unknown) => {
    if (process.platform !== 'win32') return false

    const win = windowFromEvent(event)
    if (!win) return false

    const parsed = parseOverlayOptions(options)
    if (!parsed) return false

    try {
      win.setTitleBarOverlay(parsed)
      return true
    } catch (error) {
      // Windows 标题栏 overlay 设置失败（窗口状态异常等）：回退 false。
      log.warn('window:titlebar:set-overlay 失败', { options: parsed, error })
      return false
    }
  })

  // 切换窗口系统材质（亚克力 / 云母 / 关闭）：参数非法返回 null；无窗口返回 null。
  // 返回**实际生效**的材质（非 Windows 11 22H2+ 时降级 'none'），供渲染层校准选择状态。
  // 云母的 DWM 档位（浅色 Mica Alt / 深色 Mica）由 applyWindowMaterial 内部解析。
  ipcMain.handle('window:setMaterial', (event, material: unknown) => {
    const normalized = normalizeWindowMaterial(material)
    if (!normalized) {
      log.warn('window:setMaterial 入参非法', { material })
      return null
    }
    const win = windowFromEvent(event)
    if (!win) return null
    const effective = applyWindowMaterial(win, normalized)
    log.info('window:setMaterial 完成', { requested: normalized, effective })
    return effective
  })

  // 当前系统是否支持窗口材质（Electron 限制：仅 Windows 11 22H2+）；
  // 渲染层据此禁用三档选择并提示。
  ipcMain.handle('window:materialSupported', () => isMaterialSupported())
}
