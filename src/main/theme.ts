import { BrowserWindow, nativeTheme, systemPreferences } from 'electron'
import { getSetting } from './database/settings'
import { logger } from './logger'

/** 主题域日志 scope。 */
const log = logger.scope('theme')

/**
 * 系统主题 / 强调色读取。
 *
 * 渲染层主题模式含 `system` 档位，系统明暗由渲染层经 `prefers-color-scheme` 订阅；
 * 此处提供主进程侧参照，供诊断 / 复用。
 *
 * 系统强调色（品牌色）：仅 light / dark 两套主题消费（由渲染层 `useSystemAccent`
 * 门控），sage / honey 保留 `theme.css` 中的静态品牌色。
 */

/** 系统强调色变化后的广播通道（渲染层 preload 订阅）。 */
export const ACCENT_CHANGED_CHANNEL = 'theme:accent:changed'

/**
 * 把 3/6/8 位十六进制串规范化为 `#rrggbb`；非法输入返回 null。
 *
 * 返回格式实测结论（Electron 44 / Windows）：
 * `systemPreferences.getAccentColor()` 返回 **无 `#` 前缀、8 位十六进制、RRGGBBAA 顺序**
 * 的字符串，例如 `"0078D4FF"`（Windows 默认蓝 #0078D4 + 不透明 alpha FF）。
 */
export function normalizeAccent(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const hex = raw.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null

  // 8 位为 RRGGBBAA（见上），丢弃 alpha；6 位直接使用；3 位展开为 6 位。
  let rgb: string
  if (hex.length === 8) {
    rgb = hex.slice(0, 6)
  } else if (hex.length === 6) {
    rgb = hex
  } else if (hex.length === 3) {
    rgb = hex
      .split('')
      .map((c) => c + c)
      .join('')
  } else {
    return null
  }

  return `#${rgb.toLowerCase()}`
}

/**
 * 读取系统强调色并解析为 `#rrggbb`。
 *
 * 读取失败 / 值非法时返回 `null`——**不提供固定兜底色**：渲染层据此清除内联覆盖，
 * 回退到 `theme.css` 当前主题自带的静态品牌色（避免系统不支持时被强行染成紫色）。
 */
export function getAccentColor(): string | null {
  try {
    return normalizeAccent(systemPreferences.getAccentColor())
  } catch (error) {
    // 环境差异（如平台不支持读取强调色）下的预期降级，交由渲染层回退主题静态色。
    log.warn('读取系统强调色失败，回退主题静态品牌色', error)
    return null
  }
}

/** 系统是否处于深色模式（渲染层 `system` 主题的主进程侧参照，供诊断 / 复用）。 */
export function getSystemShouldUseDarkColors(): boolean {
  return nativeTheme.shouldUseDarkColors
}

/**
 * 应用主题档位（与渲染层 `theme/themes.ts` 的 `ThemeId` 同步维护）。
 *
 * 主进程不得 import 渲染层模块：此处独立声明并校验，修改档位时两侧同步。
 */
export type ThemeId = 'system' | 'light' | 'dark' | 'sage' | 'honey'

/** 实际生效主题：`system` 解析后的结果（与 theme.css 的 data-theme 取值一致）。 */
export type ResolvedThemeId = Exclude<ThemeId, 'system'>

const THEME_IDS: readonly ThemeId[] = ['system', 'light', 'dark', 'sage', 'honey']

/** settings 表持久化键名（存用户选择本身，含 `system`；与渲染层常量同步）。 */
export const THEME_SETTING_KEY = 'theme'

/** 类型守卫：仅接受五档合法主题。 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/**
 * 应用主题 → `nativeTheme.themeSource`。
 *
 * sage / honey 没有独立的 DWM 明暗，统一按浅色映射 `'light'`；`system` 原样交给
 * Electron 跟随系统，避免应用层再解析一次造成双重跟随。
 */
export function themeIdToNativeThemeSource(theme: ThemeId): 'system' | 'light' | 'dark' {
  switch (theme) {
    case 'system':
      return 'system'
    case 'dark':
      return 'dark'
    case 'light':
    case 'sage':
    case 'honey':
      return 'light'
  }
}

/** 读取启动时的初始主题：合法持久化值则用之，否则回退跟随系统。 */
export function readInitialThemeId(): ThemeId {
  try {
    const value = getSetting(THEME_SETTING_KEY)
    if (isThemeId(value)) return value
  } catch (error) {
    // 数据库尚未就绪等异常：预期回退默认档位，不阻断启动。
    log.warn('读取持久化主题失败，回退跟随系统', error)
  }
  return 'system'
}

/**
 * 按应用主题设置 `nativeTheme.themeSource`，返回解析后的明暗。
 *
 * - 仅 Windows 写入：DWM 材质（亚克力 / 云母）的明暗由 `themeSource` 决定；
 *   非 Windows 不覆盖系统设置，只返回当前解析值。
 * - 赋值前比较当前值，相同则跳过（避免无意义的原生主题更新），仍返回解析值。
 * - 异常时记录 warning 并回退 `'light'` 安全值，不阻断启动 / IPC。
 */
export function applyThemeSource(theme: ThemeId): ResolvedThemeId {
  try {
    if (process.platform === 'win32') {
      const source = themeIdToNativeThemeSource(theme)
      if (nativeTheme.themeSource !== source) {
        nativeTheme.themeSource = source
      }
    }
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  } catch (error) {
    log.warn('应用窗口明暗主题失败，回退浅色', error)
    return 'light'
  }
}

let watchersReady = false

/**
 * 监听系统主题变化并向所有窗口广播最新强调色。
 * `nativeTheme` 的 `updated` 事件在系统明暗 / 高对比等变化时触发；
 * Windows 强调色改动通常伴随该事件。重复调用为幂等，不会重复注册。
 */
export function setupThemeWatchers(): void {
  if (watchersReady) return
  watchersReady = true

  nativeTheme.on('updated', () => {
    const color = getAccentColor()
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(ACCENT_CHANGED_CHANNEL, color)
      }
    }
  })
}
