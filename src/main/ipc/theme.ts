import { ipcMain } from 'electron'
import { getAccentColor, setupThemeWatchers } from '../theme'

/** 主题 / 系统强调色域 IPC：通道前缀 `theme:`。 */
export function registerThemeIpc(): void {
  ipcMain.handle('theme:accent:get', () => getAccentColor())

  // 注册一次性系统监听（明暗 / 强调色变化后向各窗口广播）
  setupThemeWatchers()
}
