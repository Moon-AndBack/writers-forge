import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ACTIVITY_PINNED_SETTING_KEY,
  ActivityPinnedContext,
  DEFAULT_ACTIVITY_PINNED
} from './activityPinned'

/**
 * 活动栏固定态 Provider：`pinned` 的唯一真源，包裹窗口外壳。
 *
 * - 状态变化时把 `pinned` 投影到 `document.body` 的 `act-pinned` 类
 *   （活动栏两态样式由该类驱动，见 shell.css）；
 * - 切换经 `settings:set` 落库 `activityBarPinned`（`'true' | 'false'`）；
 *   首帧固定态由 main.tsx 启动预取并作为 `initialPinned` 传入，避免异步读取闪烁
 *   （与 rightPaneVisibilityProvider 同范式）；
 * - 由于 `children` 由上层（App）以稳定引用传入，本 Provider 的 state 变化
 *   只会重渲染读取上下文的活动栏 / 图钉按钮，不会重渲染页面子树
 *   （与 statusBarContext / titleBarActions 同范式，无注册循环）。
 */
export function ActivityPinnedProvider({
  children,
  initialPinned = DEFAULT_ACTIVITY_PINNED
}: {
  children: ReactNode
  /** 启动预取（main.tsx 读 `activityBarPinned`）解析出的首帧固定态，缺省悬浮。 */
  initialPinned?: boolean
}) {
  const [pinned, setPinnedState] = useState(initialPinned)

  // pinned → body 类（写入同值属空操作，不会造成副作用循环）
  useEffect(() => {
    document.body.classList.toggle('act-pinned', pinned)
  }, [pinned])

  // 单写链路：先更新内存态，再异步落库（低频点击，IPC 失败静默忽略、不回滚）
  const setPinned = useCallback((next: boolean): void => {
    setPinnedState(next)
    void window.api?.settings
      .set(ACTIVITY_PINNED_SETTING_KEY, next ? 'true' : 'false')
      .catch(() => {})
  }, [])

  const value = useMemo(() => ({ pinned, setPinned }), [pinned, setPinned])

  return <ActivityPinnedContext.Provider value={value}>{children}</ActivityPinnedContext.Provider>
}
