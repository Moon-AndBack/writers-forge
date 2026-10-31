import { useCallback, useEffect, useMemo, useSyncExternalStore, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_RIGHT_PANE_HIDDEN,
  RIGHT_PANE_HIDDEN_SETTING_KEY,
  RIGHT_PANE_NARROW_QUERY,
  RightPaneVisibilityContext
} from './rightPaneVisibility'

/** `matchMedia` 订阅（`useSyncExternalStore` 的 subscribe）。 */
function subscribeNarrow(onChange: () => void): () => void {
  const query = window.matchMedia(RIGHT_PANE_NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** 当前是否处于窄窗断点（`useSyncExternalStore` 的 getSnapshot）。 */
function getNarrowSnapshot(): boolean {
  return window.matchMedia(RIGHT_PANE_NARROW_QUERY).matches
}

/**
 * 写作页右栏显隐 Provider：包裹窗口外壳（App 层），仿 `TypographyProvider`
 * 的「挂载时异步恢复 + 变更即持久化」范式。
 *
 * - 启动恢复：`settings:get` 读 `rightPaneHidden`（`'true' | 'false'` 字面值），
 *   仅 `'true'` 切换为隐藏；`'false'` / 缺省 / 非法值保持默认显示。
 *   恢复完成前以默认显示渲染（与 TypographyProvider 一致：异步间隙首帧
 *   可能短暂显示右栏，属可接受的微小闪烁，不为此增加启动预取链路）；
 * - `toggle` 即时切换并经 `settings:set` 落库（低频点击，无需防抖；
 *   IPC 失败静默忽略，不回滚界面状态）；`show` / `setHidden` 为显式 API
 *  （隐藏时点卡自动展开用），与 `toggle` 共用单写链路；
 * - 窄窗同步：用与 `writer.css` 同一断点的 `matchMedia` 订阅 `narrow`，
 *   并派生 `effectiveHidden = hidden || narrow`；标题栏按钮据此显示
 *   **实际**可见性（窄窗时按钮为不可用，避免出现「高亮但右栏被 CSS 隐藏」）；
 * - 消费方：标题栏切换按钮（全页面读写）与写作页 Writer / RightPane
 *   （实际渲染）。窄窗（`max-width: 1240px`）下 CSS 媒体查询会**额外**
 *   强制隐藏右栏，与本偏好叠加：偏好仍在，窗口变宽后按偏好渲染。
 */
export function RightPaneVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(DEFAULT_RIGHT_PANE_HIDDEN)
  const narrow = useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, () => false)

  // 启动恢复：settings:get → 仅接受 'true' 字面值，其余（'false'/非法/缺省）保持显示
  useEffect(() => {
    let mounted = true
    void window.api?.settings
      .get(RIGHT_PANE_HIDDEN_SETTING_KEY)
      .then((saved) => {
        if (!mounted) return
        if (saved === 'true') setHiddenState(true)
      })
      .catch(() => {
        /* 无 API / IPC 异常时保持默认显示 */
      })
    return () => {
      mounted = false
    }
  }, [])

  const setHidden = useCallback((next: boolean): void => {
    setHiddenState(next)
    void window.api?.settings
      .set(RIGHT_PANE_HIDDEN_SETTING_KEY, next ? 'true' : 'false')
      .catch(() => {})
  }, [])

  const toggle = useCallback((): void => {
    setHidden(!hidden)
  }, [hidden, setHidden])

  const show = useCallback((): void => {
    setHidden(false)
  }, [setHidden])

  const value = useMemo(
    () => ({ hidden, narrow, effectiveHidden: hidden || narrow, toggle, show, setHidden }),
    [hidden, narrow, toggle, show, setHidden]
  )

  return (
    <RightPaneVisibilityContext.Provider value={value}>
      {children}
    </RightPaneVisibilityContext.Provider>
  )
}

export default RightPaneVisibilityProvider
