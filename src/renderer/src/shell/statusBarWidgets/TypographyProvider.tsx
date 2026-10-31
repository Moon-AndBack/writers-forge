import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DEFAULT_TYPOGRAPHY,
  TYPOGRAPHY_CSS_VARS,
  TYPOGRAPHY_SETTING_KEY,
  TypographyContext,
  resolveTypography
} from './typographyContext'
import type { TypographyState } from './typographyContext'

/** 连续修改后的静默期：最后一次变更 400ms 后才写库（对齐主题切换的静默写库习惯）。 */
const PERSIST_DEBOUNCE_MS = 400

/**
 * 排版 / 缩放设置 Provider：包裹窗口外壳。
 *
 * - 挂载时从 settings 表恢复（`settings:get`，无值 / 非法值逐项回退默认档），
 *   恢复完成前以默认档渲染（无闪烁，仅字体首帧可能短暂回退）；
 * - `setTypography` 即时生效（写文档根元素的 CSS 变量，与原型 §10 同作用域），
 *   持久化经 `settings:set` 防抖 400ms 后写入（连点 / 连续加减只落一次库）；
 * - 卸载时若仍有未落库的变更，立即补写一次，避免丢失最后一次选择。
 */
export function TypographyProvider({ children }: { children: ReactNode }) {
  const [typography, setTypographyState] = useState<TypographyState>(DEFAULT_TYPOGRAPHY)
  const timerRef = useRef<number | null>(null)
  // latestRef 持有最新状态：挂载恢复 / 卸载补写 / 防抖回调都读它，避免闭包过期。
  // 在 effect 中同步（渲染期间访问 ref 属 lint 禁止的反模式）。
  const latestRef = useRef(typography)

  useEffect(() => {
    latestRef.current = typography
  }, [typography])

  // CSS 变量即时生效：值域即变量字面值，直接整组写入（同值写入属空操作）
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty(TYPOGRAPHY_CSS_VARS.font, typography.font)
    root.style.setProperty(TYPOGRAPHY_CSS_VARS.line, typography.line)
    root.style.setProperty(TYPOGRAPHY_CSS_VARS.letter, typography.letter)
    root.style.setProperty(TYPOGRAPHY_CSS_VARS.page, typography.page)
    root.style.setProperty(TYPOGRAPHY_CSS_VARS.zoom, typography.zoom)
  }, [typography])

  // 启动恢复：settings:get → 校验 → 挂载期间变更过则不覆盖用户的选择
  useEffect(() => {
    let mounted = true
    void window.api?.settings
      .get(TYPOGRAPHY_SETTING_KEY)
      .then((saved) => {
        if (!mounted || !saved) return
        try {
          const next = resolveTypography(JSON.parse(saved))
          setTypographyState(next)
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
        .set(TYPOGRAPHY_SETTING_KEY, JSON.stringify(latestRef.current))
        .catch(() => {})
    },
    []
  )

  const setTypography = useMemo(() => {
    const persist = (): void => {
      timerRef.current = null
      void window.api?.settings
        .set(TYPOGRAPHY_SETTING_KEY, JSON.stringify(latestRef.current))
        .catch(() => {})
    }

    return (patch: Partial<TypographyState>): void => {
      setTypographyState((prev) => ({ ...prev, ...patch }))
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(persist, PERSIST_DEBOUNCE_MS)
    }
  }, [])

  const value = useMemo(() => ({ typography, setTypography }), [typography, setTypography])

  return <TypographyContext.Provider value={value}>{children}</TypographyContext.Provider>
}
