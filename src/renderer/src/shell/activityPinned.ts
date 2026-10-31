import { createContext, useContext } from 'react'

/**
 * 活动栏两态（悬浮 / 固定）的共享状态：
 * `ActivityPinnedProvider` 持有唯一真源并把 `pinned` 投影到 `body.act-pinned`，
 * 供活动栏视图（activityBar.tsx）与状态栏图钉按钮（PinButton.tsx）共同消费。
 */

/** settings 表持久化键名（存 `'true' | 'false'` 字面字符串）。 */
export const ACTIVITY_PINNED_SETTING_KEY = 'activityBarPinned'

/** 默认悬浮（未固定），与既有行为一致。 */
export const DEFAULT_ACTIVITY_PINNED = false

interface ActivityPinnedContextValue {
  /** 是否固定（`body.act-pinned` 是否存在）。 */
  pinned: boolean
  /** 切换固定态。 */
  setPinned: (pinned: boolean) => void
}

const ActivityPinnedContext = createContext<ActivityPinnedContextValue | null>(null)

/**
 * 读取活动栏固定态。无 Provider（如独立测试渲染）时回退为未固定 + 空操作，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useActivityPinned(): ActivityPinnedContextValue {
  const context = useContext(ActivityPinnedContext)
  if (!context) {
    return { pinned: DEFAULT_ACTIVITY_PINNED, setPinned: () => undefined }
  }
  return context
}

/** context 仅供 activityPinnedProvider.tsx 内部装配使用。 */
export { ActivityPinnedContext }
