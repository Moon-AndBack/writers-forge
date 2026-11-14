import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext } from './context'
import { cancelThemeReveal, runThemeReveal } from './themeReveal'
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

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME
}: {
  children: ReactNode
  /** 启动时由 main.tsx 从数据库预取并校验后的初始主题，避免异步读取造成闪屏 */
  initialTheme?: ThemeId
}) {
  const [theme, setThemeState] = useState<ThemeId>(initialTheme)
  /**
   * 系统明暗。`nativeTheme.themeSource` 被主进程强制为 light / dark 后，`matchMedia`
   * 返回的是覆盖后的值而非真实 OS 状态；切回 `system` 时以主进程返回的权威明暗校正，
   * 故此处用可写 state 而非纯媒体查询只读订阅。
   */
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia(DARK_QUERY).matches)
  const resolvedTheme = resolveTheme(theme, systemDark)

  // 媒体查询订阅只注册一次：空依赖 effect，`setTheme` 重建不会重复订阅 / 退订。
  // 显式档期间收到的变化来自被强制的 themeSource，对显式档无影响；切回 system 时
  // 由 `theme:apply` 的返回值直接校正 systemDark。
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    // 写入的始终是解析后的生效主题，绝不写 'system'。
    // 系统明暗被动变化（`prefers-color-scheme` 变化 → resolvedTheme 变化）在此
    // **直接**落盘、不经覆盖层动画。这是预期行为而非遗漏：用户并未主动切主题，
    // 此时整窗动画反而突兀；主动切换（setTheme）才走模糊遮罩。
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  // 系统强调色驱动品牌色：仅 light / dark 生效，sage / honey 回退 theme.css 静态色
  useSystemAccent(resolvedTheme)

  useEffect(() => {
    // 持久化用户选择本身（含 'system'）；无 Electron API 时静默跳过
    void window.api?.settings.set(THEME_SETTING_KEY, theme).catch(() => {})
  }, [theme])

  // Provider 卸载时移除可能仍在显示的遮罩，避免残留全屏层拦截交互
  useEffect(() => cancelThemeReveal, [])

  /**
   * 提交目标档位与已解析生效主题。
   *
   * 必须与 `dataset.theme` 在**同一同步段**完成：覆盖层的 `__blur` 已经完全不透明，
   * 原生材质也已由主进程切好，此刻写 dataset 并 flushSync，用户看到的才是
   * 「遮罩后的三栏与底色一起翻到新主题」。
   */
  const commitTheme = useCallback((next: ThemeId, resolved: ResolvedThemeId) => {
    document.documentElement.dataset.theme = resolved
    flushSync(() => {
      // system 档在同一批次校正权威明暗；显式档不动 systemDark
      if (next === 'system') setSystemDark(resolved === 'dark')
      setThemeState(next)
    })
  }, [])

  const setTheme = useCallback(
    (next: ThemeId) => {
      // 重复选择同一档：无需过渡（点击仍由调用方负责关闭面板）
      if (next === theme) return

      if (next !== 'system') {
        // 显式档本地即可解析：先判断是否与当前**生效**主题相同。
        // 典型：当前是 'system' 且系统为暗，用户改选明确的 'dark'——dataset 前后
        // 都是 'dark'，播放动画会空转成「没反应」，故只提交状态。
        const resolved = resolveTheme(next, systemDark)
        if (resolved === document.documentElement.dataset.theme) {
          cancelThemeReveal()
          flushSync(() => setThemeState(next))
          return
        }

        runThemeReveal({
          resolve: async () => {
            // 只用于同步原生材质（themeSource / DWM）；不采用其 resolvedTheme，
            // 因为 sage / honey 下它是 DWM 明暗，不等于应用主题。
            const pending = window.api?.systemTheme.apply(next) ?? Promise.resolve(null)
            await pending.catch(() => null)
            return resolveTheme(next, systemDark)
          },
          fallback: () => resolveTheme(next, systemDark),
          commit: (target) => commitTheme(next, target)
        })
        return
      }

      // system 档：必须先让主进程恢复 themeSource='system' 并返回真实 OS 明暗，
      // 再用 shouldUseDarkColors 解析。按被强制覆盖后的 matchMedia 预解析，从
      // sage 切回 system（OS 深色）会先算出 light 播放一次，再硬切 dark（先浅后深）。
      runThemeReveal({
        resolve: async () => {
          const pending = window.api?.systemTheme.apply('system') ?? Promise.resolve(null)
          const result = await pending.catch(() => null)
          if (!result) return systemDark ? 'dark' : 'light'
          return result.shouldUseDarkColors ? 'dark' : 'light'
        },
        fallback: () => (systemDark ? 'dark' : 'light'),
        commit: (target) => commitTheme('system', target)
      })
    },
    [theme, systemDark, commitTheme]
  )

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme, themes: THEMES }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export default ThemeProvider
