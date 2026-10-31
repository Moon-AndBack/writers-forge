import { createContext, useContext } from 'react'

/**
 * 窗口材质设置（Windows Acrylic 亚克力透明效果）。
 * 与主进程 `src/main/windowMaterial.ts` 的取值保持一致。
 */
export type WindowMaterialSetting = 'acrylic' | 'none'

/** settings 表持久化键名（存用户选择本身，与主进程读取同一键）。 */
export const WINDOW_MATERIAL_SETTING_KEY = 'windowMaterial'

/**
 * 默认设置：开启（Acrylic）。
 * 理由：与主进程默认一致——默认提供亚克力透明观感；不支持的平台由
 * Provider 的 `supported` 查询降级关闭，不影响可用性。
 */
export const DEFAULT_WINDOW_MATERIAL_SETTING: WindowMaterialSetting = 'acrylic'

/**
 * 把持久化原始值规范化为当前取值。
 *
 * 兼容迁移：旧值 `'mica'` 曾表示「开启透明材质」，一律按 `'acrylic'` 处理，
 * 保留用户开启意图；其余非法值返回 null。
 */
export function normalizeWindowMaterialSetting(value: unknown): WindowMaterialSetting | null {
  if (value === 'acrylic' || value === 'none') return value
  if (value === 'mica') return 'acrylic'
  return null
}

/** 类型守卫：仅接受当前合法取值（旧值请先经 `normalizeWindowMaterialSetting` 迁移）。 */
export function isWindowMaterialSetting(value: unknown): value is WindowMaterialSetting {
  return value === 'acrylic' || value === 'none'
}

export interface WindowMaterialContextValue {
  /** 实际生效的透明效果（不支持时恒为 false，开关同步置灰） */
  enabled: boolean
  /** 当前系统是否支持 Acrylic */
  supported: boolean
  /** 切换透明效果：切换主进程材质 + 根元素标记 + 持久化 */
  setEnabled: (enabled: boolean) => void
}

export const WindowMaterialContext = createContext<WindowMaterialContextValue | null>(null)

/**
 * 读取 / 切换窗口透明效果。无 Provider（如独立测试渲染）时回退默认值 + 空操作，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useWindowMaterial(): WindowMaterialContextValue {
  const context = useContext(WindowMaterialContext)
  if (!context) {
    return { enabled: false, supported: false, setEnabled: () => undefined }
  }
  return context
}
