import { createContext, useContext } from 'react'

/**
 * 窗口材质设置（Windows DWM 材质：亚克力 / 云母 / 关闭）。
 * 与主进程 `src/main/windowMaterial.ts` 的取值保持一致。
 */
export type WindowMaterialSetting = 'acrylic' | 'mica' | 'none'

/** settings 表持久化键名（存用户选择本身，与主进程读取同一键）。 */
export const WINDOW_MATERIAL_SETTING_KEY = 'windowMaterial'

/**
 * 默认设置：亚克力。
 * 理由：与主进程默认一致——默认提供亚克力观感；不支持的平台由
 * Provider 的 `supported` 查询降级关闭，不影响可用性。
 */
export const DEFAULT_WINDOW_MATERIAL_SETTING: WindowMaterialSetting = 'acrylic'

/**
 * 把持久化原始值规范化为当前取值。
 *
 * 三档均为合法值，不做旧值迁移；其余非法值返回 null。
 */
export function normalizeWindowMaterialSetting(value: unknown): WindowMaterialSetting | null {
  if (value === 'acrylic' || value === 'mica' || value === 'none') return value
  return null
}

/** 类型守卫：仅接受三档合法取值。 */
export function isWindowMaterialSetting(value: unknown): value is WindowMaterialSetting {
  return value === 'acrylic' || value === 'mica' || value === 'none'
}

export interface WindowMaterialContextValue {
  /** 实际生效的材质：系统不支持时恒为 'none'（三档选择同步置灰） */
  material: WindowMaterialSetting
  /** 是否处于任一材质开启状态（派生于 `material !== 'none'`，兼容旧消费点） */
  enabled: boolean
  /** 当前系统是否支持窗口材质 */
  supported: boolean
  /** 切换材质：切换主进程材质 + 根元素标记 + 持久化 */
  setMaterial: (material: WindowMaterialSetting) => void
}

export const WindowMaterialContext = createContext<WindowMaterialContextValue | null>(null)

/**
 * 读取 / 切换窗口材质。无 Provider（如独立测试渲染）时回退默认值 + 空操作，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useWindowMaterial(): WindowMaterialContextValue {
  const context = useContext(WindowMaterialContext)
  if (!context) {
    return { material: 'none', enabled: false, supported: false, setMaterial: () => undefined }
  }
  return context
}
