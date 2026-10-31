import type { BrowserWindow } from 'electron'
import { logger } from './logger'
import { getSetting, setSetting } from './database/settings'

/** 窗口尺寸域日志 scope。 */
const log = logger.scope('windowState')

/** 窗口尺寸持久化键名（settings 表） */
export const WINDOW_SIZE_SETTING_KEY = 'windowSize'

/**
 * 默认 / 最小窗口尺寸（外框，单位 DIP）。
 *
 * 口径：宽度恰好放下 4 张书卡；高度恰好显示 1.5 行卡片 + 外壳 chrome。
 * 推导（均为无头实测的 CSS px，Windows 11 DWM 下外框 = 内容区，无额外边框）：
 * - 宽 = 4×200（卡宽）+ 3×18（列间距）+ 2×14（.bookshelf-view 左右 padding）
 *        + 2×4（.book-grid 左右 padding）+ 12（垂直滚动条）= 902；
 * - 高 = 42（.titlebar）+ 36（.statusbar）+ 2×12（.bookshelf-view 上下 padding）
 *        + 45.8（.shelf-toolbar）+ [2（.book-grid padding-top）+ 400（第 1 排卡）
 *        + 14（行距）+ 200（半排）] = 763.8 → 764。
 */
export const DEFAULT_WINDOW_WIDTH = 902
export const DEFAULT_WINDOW_HEIGHT = 764

/** 持久化尺寸的合理范围（外框 DIP），超出即视为脏数据回退默认值 */
export const MIN_VALID_WINDOW_WIDTH = 320
export const MIN_VALID_WINDOW_HEIGHT = 240
export const MAX_VALID_WINDOW_WIDTH = 10000
export const MAX_VALID_WINDOW_HEIGHT = 10000

/** 窗口尺寸（外框，DIP） */
export interface WindowSize {
  width: number
  height: number
}

/**
 * 解析 `"<宽>x<高>"` 形式的尺寸串。
 * 仅接受两个十进制正整数且在合理范围内；其余（null / 空串 / 负数 / 零 /
 * 小数 / 多余字符 / 越界）一律返回 null。
 */
export function parseWindowSize(value: string | null): WindowSize | null {
  if (typeof value !== 'string') return null

  const match = /^(\d{1,4})x(\d{1,4})$/.exec(value.trim())
  if (!match) return null

  const width = Number(match[1])
  const height = Number(match[2])
  if (
    width < MIN_VALID_WINDOW_WIDTH ||
    width > MAX_VALID_WINDOW_WIDTH ||
    height < MIN_VALID_WINDOW_HEIGHT ||
    height > MAX_VALID_WINDOW_HEIGHT
  ) {
    return null
  }

  return { width, height }
}

/** 序列化尺寸为 `"<宽>x<高>"`（四舍五入取整，Rectangle 为整数） */
export function serializeWindowSize(size: WindowSize): string {
  return `${Math.round(size.width)}x${Math.round(size.height)}`
}

/** 默认窗口尺寸 */
function defaultWindowSize(): WindowSize {
  return { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT }
}

/**
 * 读取启动时的初始窗口尺寸：
 * 有合法持久化值则用之，否则（无值 / 非法 / 读库异常）回退默认尺寸。
 */
export function readInitialWindowSize(): WindowSize {
  try {
    const parsed = parseWindowSize(getSetting(WINDOW_SIZE_SETTING_KEY))
    if (parsed) return parsed
  } catch (error) {
    // 数据库尚未就绪等异常：预期回退默认尺寸，不阻断启动。
    log.warn('读取持久化窗口尺寸失败，回退默认尺寸', error)
  }
  return defaultWindowSize()
}

/** 写入窗口尺寸（序列化后落库；异常记录但不影响窗口使用） */
export function saveWindowSize(size: WindowSize): void {
  try {
    setSetting(WINDOW_SIZE_SETTING_KEY, serializeWindowSize(size))
  } catch (error) {
    // 写库失败（如退出流程中数据库已关闭）不影响窗口，记录 warn 便于排查。
    log.warn('持久化窗口尺寸失败', error)
  }
}

/** resize 防抖间隔（ms）：拖拽中高频触发，静默后再落库 */
export const WINDOW_SIZE_SAVE_DELAY = 300

/**
 * 注册窗口尺寸持久化：
 * - `resize` 防抖后落库；
 * - 仅记录非最大化 / 非全屏 / 非最小化时的尺寸（用 `getNormalBounds()`，
 *   避免把最大化尺寸写入）；
 * - `close` 时补写一次，确保最后一次尺寸入库。
 */
export function registerWindowSizePersistence(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const persist = (): void => {
    timer = null
    if (win.isDestroyed()) return
    // 最大化 / 全屏 / 最小化时不记录：保留恢复态尺寸
    if (win.isMaximized() || win.isFullScreen() || win.isMinimized()) return

    const { width, height } = win.getNormalBounds()
    saveWindowSize({ width, height })
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, WINDOW_SIZE_SAVE_DELAY)
  }

  win.on('resize', schedule)
  win.on('close', () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    persist()
  })
}
