import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
 * - 切换时：① 经 `window.api.windowMaterial.set` 切换主进程 `backgroundMaterial`；
 *   ② 在根元素写 `data-material` 驱动 CSS；③ 经 `settings:set` 持久化；
 * - 切换按方向有序进行，避免窗口底与页面底色错位（白闪 / 露底）：
 *   开启时等主进程返回后再透明页面；关闭时先让页面不透明，再回退窗口底；
 * - 状态变化时把结果投影到 `document.documentElement.dataset.material`，
 *   由 `styles/material.css` 的 `:is([data-material='acrylic'], [data-material='mica']) .shell`
 *   覆盖底部背景。
 *
 * 说明：主进程已在建窗前读取同一 settings 键并应用材质，故启动时传 `initialMaterial`
 * 即可，无需渲染层再读库；`supported` 由 main.tsx 启动预取 `materialSupported` 后经
 * `initialSupported` 传入（非 Windows 降级关闭）。
 */
export function WindowMaterialProvider({
  children,
  initialMaterial = DEFAULT_WINDOW_MATERIAL_SETTING,
  initialSupported = false
}: {
  children: ReactNode
  /** 启动时由 main.tsx 从数据库预取并校验后的初始值，避免异步读取造成闪屏 */
  initialMaterial?: WindowMaterialSetting
  /** 启动时由 main.tsx 预取的系统支持状态，首帧即按真实支持度渲染 */
  initialSupported?: boolean
}) {
  const [setting, setSettingState] = useState<WindowMaterialSetting>(initialMaterial)
  const supported = initialSupported
  const requestSeq = useRef(0)

  // 实际生效：系统支持才保留用户选择，否则降级 none；同步投影到根元素 dataset 驱动 CSS
  const material: WindowMaterialSetting = setting !== 'none' && supported ? setting : 'none'
  const enabled = material !== 'none'

  useEffect(() => {
    document.documentElement.dataset.material = material
  }, [material])

  const setMaterial = useCallback(
    (next: WindowMaterialSetting) => {
      const seq = ++requestSeq.current
      // 投影实际生效值到 DOM 与 state（同步写 DOM，不等待 React 异步提交）
      const project = (value: WindowMaterialSetting) => {
        const resolved = value !== 'none' && supported ? value : 'none'
        document.documentElement.dataset.material = resolved
        setSettingState(resolved)
      }
      // 持久化用户选择本身（无 Electron API 时静默跳过），不阻塞切换
      void window.api?.settings.set(WINDOW_MATERIAL_SETTING_KEY, next).catch(() => {})

      // 关闭：先页面不透明，再由主进程回退窗口底色（#f3f3f3）
      if (next === 'none') {
        project('none')
        void window.api?.windowMaterial?.set('none').catch(() => {})
        return
      }

      // 开启：等主进程应用材质（窗口底透明）后，再透明页面；页面在此之前保持不透明
      const pending = window.api?.windowMaterial?.set(next) ?? Promise.resolve(null)
      void pending
        .catch(() => null)
        .then((effective) => {
          // 较新的切换已发出时丢弃过期结果
          if (seq !== requestSeq.current) return
          // 失败或无结果：按不透明兜底（主进程未确认材质即视为未生效）
          project(effective ?? 'none')
        })
    },
    [supported]
  )

  const value = useMemo(
    () => ({ material, enabled, supported, setMaterial }),
    [material, enabled, supported, setMaterial]
  )

  return <WindowMaterialContext.Provider value={value}>{children}</WindowMaterialContext.Provider>
}

export default WindowMaterialProvider
