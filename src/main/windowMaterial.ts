import type { BrowserWindow } from 'electron'
import { logger } from './logger'
import { getSetting } from './database/settings'

/** 窗口材质域日志 scope。 */
const log = logger.scope('windowMaterial')

/**
 * 窗口系统材质（Windows Acrylic 亚克力透明效果）。
 *
 * 仅两种取值：`acrylic` 开启（窗口背景透明，透出 DWM Acrylic）/
 * `none` 关闭（不透明，回退到渲染层光斑渐变）。
 */
export type WindowMaterial = 'acrylic' | 'none'

/** settings 表持久化键名（存用户选择本身） */
export const WINDOW_MATERIAL_SETTING_KEY = 'windowMaterial'

/**
 * 默认材质：开启（Acrylic）。
 * 理由：默认提供 Windows 11 22H2+ 的亚克力透明观感；运行时经 `resolveMaterial`
 * 在不支持的平台（旧 Windows / 非 Windows）自动降级 `none`，不影响可用性。
 */
export const DEFAULT_WINDOW_MATERIAL: WindowMaterial = 'acrylic'

/**
 * Electron `setBackgroundMaterial` 的 Windows 版本门槛（build 22621）。
 *
 * 依据：Electron 实现（shell/browser/native_window_views.cc）中
 * `SetBackgroundMaterial` 在 `base::win::GetVersion() < WIN11_22H2` 时直接 return，
 * 对 `acrylic` 与 `mica` 一视同仁；官方 API 文档亦标注
 * 「This method is only supported on Windows 11 22H2 and up.」。
 * Windows 10 的原生亚克力（build 17763+）并不经由此 API 暴露，故不纳入支持范围。
 * 参考：electron/electron#48440（Win10 acrylic 不生效）、#48031。
 */
const ACRYLIC_MIN_BUILD = 22621

/** 关闭材质时的窗口底：沿用 light 主题 --win-rgb（243,243,243），避免创建瞬间黑闪 */
const FALLBACK_WINDOW_COLOR = '#f3f3f3'

/** 开启材质时的窗口底：全透明，让 DWM Acrylic 从窗口与 Web 内容之间透出 */
const MATERIAL_WINDOW_COLOR = '#00000000'

/**
 * 把持久化 / IPC 传入的原始值规范化为当前取值。
 *
 * 兼容迁移：旧版本键值 `'mica'` 曾表示「开启透明材质」，一律按 `'acrylic'`
 * 处理，保留用户开启意图（运行时若系统不支持再降级 `'none'`）；其余非法值返回 null。
 */
export function normalizeWindowMaterial(value: unknown): WindowMaterial | null {
  if (value === 'acrylic' || value === 'none') return value
  if (value === 'mica') return 'acrylic'
  return null
}

/** 类型守卫：当前仅接受合法取值（旧值 `'mica'` 请先经 `normalizeWindowMaterial` 迁移）。 */
export function isWindowMaterial(value: unknown): value is WindowMaterial {
  return value === 'acrylic' || value === 'none'
}

/**
 * 当前系统是否支持 Acrylic（Electron 限制：仅 Windows 11 22H2+，build ≥ 22621）。
 *
 * 注：Windows 的 Desktop Acrylic 本身在 Win10 1809（17763）即可用，但 Electron
 * 未通过 `backgroundMaterial` 暴露该路径，故此处以 Electron 实际门槛为准。
 */
export function isAcrylicSupported(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(process.getSystemVersion().split('.')[2])
  return Number.isFinite(build) && build >= ACRYLIC_MIN_BUILD
}

/**
 * 读取启动时的初始材质：有合法持久化值则用之（含旧值 `'mica'` → `'acrylic'` 迁移），
 * 否则回退默认（不透明）。
 * 注意此处返回用户「选择」本身，是否真正生效由 `resolveMaterial` 判定。
 */
export function readInitialWindowMaterial(): WindowMaterial {
  try {
    const normalized = normalizeWindowMaterial(getSetting(WINDOW_MATERIAL_SETTING_KEY))
    if (normalized) return normalized
  } catch (error) {
    // 数据库尚未就绪等异常：预期回退默认材质，不阻断启动。
    log.warn('读取持久化窗口材质失败，回退默认材质', error)
  }
  return DEFAULT_WINDOW_MATERIAL
}

/** 把用户选择解析为实际可生效的材质：不支持 Acrylic 时一律降级为 none。 */
export function resolveMaterial(material: WindowMaterial): WindowMaterial {
  return material === 'acrylic' && isAcrylicSupported() ? 'acrylic' : 'none'
}

/**
 * 应用材质到窗口，返回**实际生效**的材质（不支持时降级 none）。
 *
 * - 非 Windows 11 22H2+：`setBackgroundMaterial` 属平台 no-op，提前降级避免副作用；
 * - 调用异常（被销毁 / 平台拒绝）时回退不透明并返回 none；
 * - 同步窗口底：开启时透明（透出 Acrylic），关闭时不透明（回退现有渐变底）。
 */
export function applyWindowMaterial(win: BrowserWindow, material: WindowMaterial): WindowMaterial {
  if (win.isDestroyed()) return DEFAULT_WINDOW_MATERIAL

  const effective = resolveMaterial(material)
  try {
    win.setBackgroundMaterial(effective)
    win.setBackgroundColor(effective === 'acrylic' ? MATERIAL_WINDOW_COLOR : FALLBACK_WINDOW_COLOR)
  } catch (error) {
    // 平台拒绝 / 窗口状态异常：回退不透明并记录（不应发生）。
    log.error('应用窗口材质失败，回退不透明', { material, effective, error })
    return DEFAULT_WINDOW_MATERIAL
  }
  return effective
}
