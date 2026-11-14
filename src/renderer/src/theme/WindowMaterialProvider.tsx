import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_WINDOW_MATERIAL_SETTING,
  WINDOW_MATERIAL_SETTING_KEY,
  WindowMaterialContext,
  type WindowMaterialSetting
} from './windowMaterial'

/**
 * 窗口材质（亚克力 / 云母 / 关闭）Provider：包裹窗口外壳。
 *
 * - `material` 是**实际生效**的材质：系统不支持时恒为 'none'，`enabled` 由其派生；
 * - 切换时三件事同步完成：① 调 `window.api.windowMaterial.set` 切换主进程
 *   `backgroundMaterial`；② 在根元素写 `data-material` 驱动 CSS；③ 经
 *   `settings:set` 持久化；
 * - 状态变化时把结果投影到 `document.documentElement.dataset.material`，
 *   由 `styles/material.css` 的 `:is([data-material='acrylic'], [data-material='mica']) .shell`
 *   覆盖底部背景。
 *
 * 说明：主进程已在建窗前读取同一 settings 键并应用材质，故启动时传 `initialMaterial`
 * 即可，无需渲染层再读库；`supported` 经 `materialSupported` 查询（非 Windows 降级关闭）。
 */
export function WindowMaterialProvider({
  children,
  initialMaterial = DEFAULT_WINDOW_MATERIAL_SETTING
}: {
  children: ReactNode
  /** 启动时由 main.tsx 从数据库预取并校验后的初始值，避免异步读取造成闪屏 */
  initialMaterial?: WindowMaterialSetting
}) {
  const [setting, setSettingState] = useState<WindowMaterialSetting>(initialMaterial)
  const [supported, setSupported] = useState(false)

  // 查询系统是否支持窗口材质（非 Electron 环境保持 false，三档选择置灰）
  useEffect(() => {
    let active = true
    void window.api?.windowMaterial
      ?.materialSupported()
      .then((value) => {
        if (active) setSupported(Boolean(value))
      })
      .catch(() => {
        /* 查询失败视为不支持，静默回退 */
      })
    return () => {
      active = false
    }
  }, [])

  // 实际生效：系统支持才保留用户选择，否则降级 none；同步投影到根元素 dataset 驱动 CSS
  const material: WindowMaterialSetting = setting !== 'none' && supported ? setting : 'none'
  const enabled = material !== 'none'

  useEffect(() => {
    document.documentElement.dataset.material = material
  }, [material])

  const setMaterial = useCallback((next: WindowMaterialSetting) => {
    setSettingState(next)
    // 持久化用户选择本身（无 Electron API 时静默跳过）
    void window.api?.settings.set(WINDOW_MATERIAL_SETTING_KEY, next).catch(() => {})
    // 切换主进程背景材质；返回实际生效值，若与预期不符（系统不支持）则回退状态
    void window.api?.windowMaterial
      ?.set(next)
      .then((effective) => {
        if (effective && effective !== next) setSettingState(effective)
      })
      .catch(() => {
        /* IPC 失败静默忽略：不影响渲染层 CSS 状态 */
      })
  }, [])

  const value = useMemo(
    () => ({ material, enabled, supported, setMaterial }),
    [material, enabled, supported, setMaterial]
  )

  return <WindowMaterialContext.Provider value={value}>{children}</WindowMaterialContext.Provider>
}

export default WindowMaterialProvider
