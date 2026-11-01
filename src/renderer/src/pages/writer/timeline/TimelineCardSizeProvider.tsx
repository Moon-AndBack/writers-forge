import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_TIMELINE_CARD_SIZE,
  TIMELINE_CARD_CSS_VARS,
  TIMELINE_CARD_SETTING_KEY,
  TimelineCardSizeContext,
  resolveTimelineCardSize
} from './timelineCardContext'
import type { TimelineCardSize } from './timelineCardContext'

/** 连续修改后的静默期：最后一次变更 400ms 后才写库（对齐排版 / 主题的静默写库习惯）。 */
const PERSIST_DEBOUNCE_MS = 400

/**
 * 时间线卡片尺寸 Provider：包裹窗口外壳（挂载于 App 层，覆盖状态栏控件与时间线视图）。
 *
 * - 挂载时从 settings 表恢复（`settings:get`，无值 / 非法值逐项回退默认档），
 *   恢复完成前以默认档渲染；
 * - `setSize` 即时生效（写文档根元素的 CSS 变量，`.timeline-main` 经继承取用），
 *   持久化经 `settings:set` 防抖 400ms 后写入；
 * - 卸载时若仍有未落库的变更，立即补写一次，避免丢失最后一次选择。
 */
export function TimelineCardSizeProvider({ children }: { children: ReactNode }) {
  const [size, setSizeState] = useState<TimelineCardSize>(DEFAULT_TIMELINE_CARD_SIZE)
  const timerRef = useRef<number | null>(null)
  // latestRef 持有最新状态：挂载恢复 / 卸载补写 / 防抖回调都读它，避免闭包过期。
  const latestRef = useRef(size)

  useEffect(() => {
    latestRef.current = size
  }, [size])

  // CSS 变量即时生效：值域即变量字面值，直接整组写入（同值写入属空操作）
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty(TIMELINE_CARD_CSS_VARS.minWidth, size.minWidth)
    root.style.setProperty(TIMELINE_CARD_CSS_VARS.maxWidth, size.maxWidth)
    root.style.setProperty(TIMELINE_CARD_CSS_VARS.minHeight, size.minHeight)
    root.style.setProperty(TIMELINE_CARD_CSS_VARS.maxHeight, size.maxHeight)
  }, [size])

  // 启动恢复：settings:get → 校验 → 挂载期间变更过则不覆盖用户的选择
  useEffect(() => {
    let mounted = true
    void window.api?.settings
      .get(TIMELINE_CARD_SETTING_KEY)
      .then((saved) => {
        if (!mounted || !saved) return
        try {
          const next = resolveTimelineCardSize(JSON.parse(saved))
          setSizeState(next)
        } catch {
          /* 存档损坏（非 JSON）时保持默认档，不抛错 */
        }
      })
      .catch(() => {
        /* 无 API / IPC 异常时保持默认档 */
      })
    return () => {
      mounted = false
    }
  }, [])

  useEffect(
    () => () => {
      if (timerRef.current === null) return
      window.clearTimeout(timerRef.current)
      timerRef.current = null
      // 卸载时补写最后一次未落库的变更（fire-and-forget，失败静默）
      void window.api?.settings
        .set(TIMELINE_CARD_SETTING_KEY, JSON.stringify(latestRef.current))
        .catch(() => {})
    },
    []
  )

  const setSize = useMemo(() => {
    const persist = (): void => {
      timerRef.current = null
      void window.api?.settings
        .set(TIMELINE_CARD_SETTING_KEY, JSON.stringify(latestRef.current))
        .catch(() => {})
    }

    return (patch: Partial<TimelineCardSize>): void => {
      setSizeState((prev) => ({ ...prev, ...patch }))
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(persist, PERSIST_DEBOUNCE_MS)
    }
  }, [])

  const value = useMemo(() => ({ size, setSize }), [size, setSize])

  return (
    <TimelineCardSizeContext.Provider value={value}>{children}</TimelineCardSizeContext.Provider>
  )
}
