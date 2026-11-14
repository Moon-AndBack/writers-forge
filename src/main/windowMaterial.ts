import { nativeTheme, type BrowserWindow } from 'electron'
import { logger } from './logger'
import { getSetting } from './database/settings'

/** 窗口材质域日志 scope。 */
const log = logger.scope('windowMaterial')

/**
 * 窗口材质（用户可见设置 / IPC 取值）。
 *
 * 三档：`acrylic` 亚克力（实时模糊背后内容）/ `mica` 云母（采样桌面壁纸）/
 * `none` 关闭（不透明，回退到渲染层光斑渐变）。
 * 云母的实际 DWM 档位随应用明暗自动解析，见 `resolveDwmMaterial`。
 */
export type WindowMaterial = 'acrylic' | 'mica' | 'none'

/**
 * 实际下发给 DWM 的材质（主进程内部取值）。
 *
 * 比用户可见档多一个 `tabbed`（Mica Alt，着色强于普通云母）：仅由
 * `resolveDwmMaterial` 在浅色主题下把 `mica` 解析而来，不对外暴露。
 */
export type DwmMaterial = 'acrylic' | 'mica' | 'tabbed' | 'none'

/** settings 表持久化键名（存用户选择本身） */
export const WINDOW_MATERIAL_SETTING_KEY = 'windowMaterial'

/**
 * 默认材质：亚克力。
 * 理由：默认提供 Windows 11 22H2+ 的亚克力观感；运行时经 `resolveMaterial`
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
const MATERIAL_MIN_BUILD = 22621

/** 关闭材质时的窗口底：近白中性色 #f3f3f3，避免创建瞬间黑闪 */
const FALLBACK_WINDOW_COLOR = '#f3f3f3'

/** 开启材质时的窗口底：全透明，让 DWM 材质从窗口与 Web 内容之间透出 */
const MATERIAL_WINDOW_COLOR = '#00000000'

/** 当前用户选择（未按平台 / 明暗降级），供主题明暗变化后重新解析 DWM 材质。 */
let currentSelection: WindowMaterial = DEFAULT_WINDOW_MATERIAL

/** 各窗口已下发的 DWM 材质：重复应用相同值时跳过原生调用，避免无谓重绘。 */
const appliedMaterials = new WeakMap<BrowserWindow, DwmMaterial>()

/**
 * 把持久化 / IPC 传入的原始值规范化为当前取值。
 *
 * 三档均为合法值；旧版「云母（增强）」的持久化值 `tabbed` **迁移为 `mica`**，
 * 避免老用户设置回落到默认亚克力造成观感突变；其余非法值返回 null。
 */
export function normalizeWindowMaterial(value: unknown): WindowMaterial | null {
  if (value === 'tabbed') return 'mica'
  if (value === 'acrylic' || value === 'mica' || value === 'none') return value
  return null
}

/** 类型守卫：仅接受三档用户可见取值。 */
export function isWindowMaterial(value: unknown): value is WindowMaterial {
  return value === 'acrylic' || value === 'mica' || value === 'none'
}

/**
 * 当前系统是否支持窗口材质（Electron 限制：仅 Windows 11 22H2+，build ≥ 22621）。
 *
 * 注：Windows 的 Desktop Acrylic 本身在 Win10 1809（17763）即可用，但 Electron
 * 未通过 `backgroundMaterial` 暴露该路径，故此处以 Electron 实际门槛为准。
 */
export function isMaterialSupported(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(process.getSystemVersion().split('.')[2])
  return Number.isFinite(build) && build >= MATERIAL_MIN_BUILD
}

/**
 * 读取启动时的初始材质：有合法持久化值则用之，否则回退默认（亚克力）。
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

/** 把用户选择解析为实际可生效的材质：系统不支持时一律降级为 none。 */
export function resolveMaterial(material: WindowMaterial): WindowMaterial {
  return material !== 'none' && isMaterialSupported() ? material : 'none'
}

/**
 * 把用户可见材质解析为实际下发给 DWM 的材质。
 *
 * `mica` 按应用明暗自动选择档位：浅色（light / sage / honey）用 `tabbed`
 * （Mica Alt，壁纸着色更强），深色用标准 `mica`。明暗来自 `nativeTheme`
 * （由 `applyThemeSource()` 按应用主题维护）；其余档位原样返回。
 */
export function resolveDwmMaterial(material: WindowMaterial): DwmMaterial {
  if (material !== 'mica') return material
  return nativeTheme.shouldUseDarkColors ? 'mica' : 'tabbed'
}

/**
 * 记录建窗时已由构造参数应用的材质（用户选择 + 实际 DWM 值）。
 *
 * 建窗路径没走 `applyWindowMaterial`，需要在此登记，主题明暗变化时才能判断
 * 「解析结果与窗口当前实际材质是否相同」，避免重复调用 `setBackgroundMaterial`。
 */
export function rememberInitialWindowMaterial(win: BrowserWindow, material: WindowMaterial): void {
  currentSelection = material
  appliedMaterials.set(win, resolveDwmMaterial(resolveMaterial(material)))
}

/**
 * 主题明暗变化后重新解析并应用云母材质（浅色 Mica Alt / 深色 Mica）。
 *
 * 仅当当前选择为 `mica`、且解析出的 DWM 材质与窗口当前实际材质不同时才重设；
 * 系统强调色变化等无关 `updated` 事件不会触发原生重绘。返回实际生效的选择值，
 * 未重设时返回 null。
 */
export function reapplyWindowMaterialForTheme(win: BrowserWindow): WindowMaterial | null {
  if (win.isDestroyed() || currentSelection !== 'mica') return null

  const dwmMaterial = resolveDwmMaterial(resolveMaterial('mica'))
  if (appliedMaterials.get(win) === dwmMaterial) return null

  return applyWindowMaterial(win, 'mica')
}

/**
 * 应用材质到窗口，返回**实际生效**的用户选择（不支持时降级 none）。
 *
 * - 非 Windows 11 22H2+：`setBackgroundMaterial` 属平台 no-op，提前降级避免副作用；
 * - 调用异常（被销毁 / 平台拒绝）时回退不透明并返回 none；
 * - 同步窗口底：任意材质开启时透明（透出 DWM 材质），关闭时不透明（回退现有渐变底）；
 * - 同一窗口重复应用相同 DWM 材质时直接跳过原生调用（主题切换 / 强调色更新
 *   可能频繁触发，避免无谓的材质重设）。
 */
export function applyWindowMaterial(win: BrowserWindow, material: WindowMaterial): WindowMaterial {
  if (win.isDestroyed()) return DEFAULT_WINDOW_MATERIAL

  currentSelection = material
  const effective = resolveMaterial(material)
  const dwmMaterial = resolveDwmMaterial(effective)

  if (appliedMaterials.get(win) === dwmMaterial) return effective

  try {
    win.setBackgroundMaterial(dwmMaterial)
    win.setBackgroundColor(dwmMaterial !== 'none' ? MATERIAL_WINDOW_COLOR : FALLBACK_WINDOW_COLOR)
    appliedMaterials.set(win, dwmMaterial)
  } catch (error) {
    // 平台拒绝 / 窗口状态异常：回退不透明并记录（不应发生）。
    log.error('应用窗口材质失败，回退不透明', { material, dwmMaterial, error })
    return DEFAULT_WINDOW_MATERIAL
  }
  return effective
}
