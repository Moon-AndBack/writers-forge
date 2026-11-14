import { BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { applyThemeSource, getAccentColor, isThemeId, setupThemeWatchers } from '../theme'
import { reapplyWindowMaterialForTheme } from '../windowMaterial'

/** 主题 / 系统强调色域 IPC：通道前缀 `theme:`。 */
export function registerThemeIpc(): void {
  ipcMain.handle('theme:accent:get', () => getAccentColor())

  /**
   * 应用主题 → `nativeTheme.themeSource`（仅 Windows），返回解析后的权威明暗。
   * 入参非法返回 null；渲染层据此校正 `system` 档的 `systemDark`，避免 matchMedia
   * 在 themeSource 被强制期间失真导致先浅后深。
   * 明暗变化后重新解析云母材质（浅色 Mica Alt / 深色 Mica），同值由窗口材质
   * 模块的缓存比较短路。
   */
  ipcMain.handle('theme:apply', (event, theme: unknown) => {
    if (!isThemeId(theme)) return null
    const resolvedTheme = applyThemeSource(theme)
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) reapplyWindowMaterialForTheme(win)
    return { resolvedTheme, shouldUseDarkColors: nativeTheme.shouldUseDarkColors }
  })

  // 注册一次性系统监听（明暗 / 强调色变化后向各窗口广播）
  setupThemeWatchers()
}
