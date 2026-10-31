import { createContext, useContext } from 'react'

/**
 * 写作页右栏（右侧面板）显隐的共享状态：
 * `RightPaneVisibilityProvider` 持有唯一真源并经 `settings:set` 持久化，
 * 供标题栏右侧工具组的切换按钮（**所有页面**渲染、读写）与写作页
 * （`Writer` / `RightPane`，实际消费显隐）共同读取。
 *
 * 状态语义为「用户偏好」（hidden true/false）：实际渲染 = 偏好 AND 窗口够宽
 * （`writer.css` 的 `@media (max-width: 1240px)` 会在窄窗下额外强制隐藏，
 * 与本状态叠加、不冲突——见 `rightPaneVisibilityProvider.tsx` 注释）。
 * Provider 用同一断点的 `matchMedia` 订阅 `narrow`，并派生 `effectiveHidden`
 * （偏好隐藏 OR 窄窗），标题栏按钮据此显示与实际右栏一致的状态。
 */

/** settings 表持久化键名（存 `'true' | 'false'` 字面字符串）。 */
export const RIGHT_PANE_HIDDEN_SETTING_KEY = 'rightPaneHidden'

/** 与 `styles/writer.css` 的右栏断点保持一致（窄窗下 CSS 强制隐藏右栏）。 */
export const RIGHT_PANE_NARROW_QUERY = '(max-width: 1240px)'

/** 默认显示右栏（与既有行为一致：右栏此前恒显示）。 */
export const DEFAULT_RIGHT_PANE_HIDDEN = false

interface RightPaneVisibilityContextValue {
  /** 用户偏好：右栏是否隐藏（窄窗媒体查询会在其上额外强制隐藏）。 */
  hidden: boolean
  /** 当前窗口是否处于右栏断点内（≤1240px，CSS 已强制隐藏右栏）。 */
  narrow: boolean
  /** 实际可见性取反：`hidden || narrow`（标题栏按钮态以此为准）。 */
  effectiveHidden: boolean
  /** 切换显隐（点击为低频操作，即时落库、无需防抖）。 */
  toggle: () => void
  /** 显式显示右栏（隐藏时点卡自动展开用；已显示时为空操作，仍落库保持一致）。 */
  show: () => void
  /** 显式设置显隐（`toggle`/`show` 均经此落地，保持单写链路）。 */
  setHidden: (next: boolean) => void
}

const RightPaneVisibilityContext = createContext<RightPaneVisibilityContextValue | null>(null)

/**
 * 读取 / 切换右栏显隐。无 Provider（如独立测试渲染）时回退默认显示 + 空操作，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useRightPaneVisibility(): RightPaneVisibilityContextValue {
  const context = useContext(RightPaneVisibilityContext)
  if (!context) {
    return {
      hidden: DEFAULT_RIGHT_PANE_HIDDEN,
      narrow: false,
      effectiveHidden: DEFAULT_RIGHT_PANE_HIDDEN,
      toggle: () => undefined,
      show: () => undefined,
      setHidden: () => undefined
    }
  }
  return context
}

/** context 仅供 rightPaneVisibilityProvider.tsx 内部装配使用。 */
export { RightPaneVisibilityContext }
