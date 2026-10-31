import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  disableSnap,
  enableSnap,
  getSnapStatus,
  parseSnapConfig,
  registerResizeSnap
} from '../resizeSnap'

function windowFromEvent(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * 宽度磁吸 IPC（通道前缀 `window:snap:`）。
 * 渲染层在书籍页挂载时 `set` 配置、卸载时 `clear`，实现「仅书籍页生效」。
 */
export function registerSnapIpc(): void {
  ipcMain.handle('window:snap:set', (event, config: unknown) => {
    const win = windowFromEvent(event)
    if (!win) return false

    const parsed = parseSnapConfig(config)
    if (!parsed) return false

    registerResizeSnap(win)
    enableSnap(win, parsed)
    return true
  })

  ipcMain.handle('window:snap:clear', (event) => {
    const win = windowFromEvent(event)
    if (!win) return false
    disableSnap(win)
    return true
  })

  ipcMain.handle('window:snap:status', (event) => {
    const win = windowFromEvent(event)
    return win ? getSnapStatus(win) : null
  })

  // 渲染层据此计算 overhead = 窗口外宽 − .book-grid 内容盒宽
  ipcMain.handle('window:bounds:get', (event) => {
    const win = windowFromEvent(event)
    return win ? win.getBounds().width : 0
  })
}
