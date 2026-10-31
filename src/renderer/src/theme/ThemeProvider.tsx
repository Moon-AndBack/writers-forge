import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext } from './context'
import { runThemeReveal } from './themeReveal'
import {
  DEFAULT_THEME,
  THEMES,
  THEME_SETTING_KEY,
  type ResolvedThemeId,
  type ThemeId
} from './themes'
import { useSystemAccent } from './useSystemAccent'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** `system` 依据系统明暗解析为 light / dark；其余主题原样返回。 */
function resolveTheme(theme: ThemeId, prefersDark: boolean): ResolvedThemeId {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

/** 订阅 `prefers-color-scheme: dark`，系统切换时实时更新。 */
function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia(DARK_QUERY)
      const listener = (): void => onStoreChange()
      media.addEventListener('change', listener)
      return () => media.removeEventListener('change', listener)
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false
  )
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME
}: {
  children: ReactNode
  /** 启动时由 main.tsx 从数据库预取并校验后的初始主题，避免异步读取造成闪屏 */
  initialTheme?: ThemeId
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme)
  const prefersDark = useSystemPrefersDark()
  const resolvedTheme = resolveTheme(theme, prefersDark)

  useEffect(() => {
    // 写入的始终是解析后的生效主题，绝不写 'system'
    // 注意：系统明暗被动变化（`prefers-color-scheme` 变化 → resolvedTheme 变化）在此
    // **直接**落盘、不经 runThemeReveal，即没有整屏淡化。这是预期行为而非遗漏：
    // 用户并未主动切主题，此时整屏动画反而突兀；主动切换（setTheme）才走过渡。
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  // 系统强调色驱动品牌色：仅 light / dark 生效，sage / honey 回退 theme.css 静态色
  useSystemAccent(resolvedTheme)

  useEffect(() => {
    // 持久化用户选择本身（含 'system'）；无 Electron API 时静默跳过
    void window.api?.settings.set(THEME_SETTING_KEY, theme).catch(() => {})
  }, [theme])

  const setTheme = useCallback(
    (next: ThemeId) => {
      // 重复选择同一档：无需过渡（点击仍由调用方负责关闭面板）
      if (next === theme) return

      // 先按当前系统明暗解析出目标生效主题，供过渡回调同步写入 dataset
      const resolved = resolveTheme(next, window.matchMedia(DARK_QUERY).matches)

      // 解析结果与当前**生效**主题相同（典型：当前是 'system' 且系统为暗，用户改选
      // 明确的 'dark'）：dataset.theme 前后都是 'dark'，两张快照像素完全一致，
      // View Transition 会空转 → 用户看不到任何变化，只会觉得「没动画 / 没反应」。
      // 此时只提交状态（让 UI 选中态反映用户的显式选择），不启动过渡。
      // 用 flushSync 与过渡分支保持一致，避免选中态落到下一帧。
      if (resolved === document.documentElement.dataset.theme) {
        flushSync(() => setThemeState(next))
        return
      }

      runThemeReveal(() => {
        // ① 直接写 dataset：View Transition 回调内必须同步完成 DOM 变更，
        //    不能等 React 的 effect（否则新快照会拍到旧主题）
        document.documentElement.dataset.theme = resolved
        // ② 同步提交 React 状态：使新快照同时包含图标 / 选中态等 React 渲染结果
        //    （主题 context 仅两个消费者、换主题只改 CSS 变量，flushSync 成本可控）
        flushSync(() => setThemeState(next))
      })
    },
    [theme]
  )

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, themes: THEMES }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export default ThemeProvider
