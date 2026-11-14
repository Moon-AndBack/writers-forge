import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  /** 切换序号：IPC 往返期间用户再次切档时，丢弃过期结果。 */
  const requestSeq = useRef(0)
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

  /** 提交目标档位与已解析生效主题：dataset 相同则只更新状态，否则走整屏过渡。 */
  const commitTheme = useCallback((next: ThemeId, resolved: ResolvedThemeId) => {
    // 解析结果与当前**生效**主题相同（典型：当前是 'system' 且系统为暗，用户改选
    // 明确的 'dark'）：dataset.theme 前后都是 'dark'，两张快照像素完全一致，
    // View Transition 会空转 → 用户看不到任何变化，只会觉得「没动画 / 没反应」。
    // 此时只提交状态（让 UI 选中态反映用户的显式选择），不启动过渡。
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
  }, [])

  const setTheme = useCallback(
    (next: ThemeId) => {
      // 重复选择同一档：无需过渡（点击仍由调用方负责关闭面板）
      if (next === theme) return

      // 每次主动切换都推进序号，使尚未返回的 system 解析结果失效
      const seq = ++requestSeq.current

      if (next === 'system') {
        // 先让主进程恢复 themeSource='system' 并返回真实 OS 明暗，再提交。
        // 若按被强制覆盖后的 matchMedia 预解析，从 sage 切回 system（OS 深色）会先
        // 算出 light 播放一次过渡，媒体查询翻回后再硬切 dark —— 即「先浅后深」。
        // 本档不在 IPC 返回前提交选中态：本地 IPC 往返为亚毫秒级，避免为消除此延迟
        // 引入「先提交错误解析、后纠正」的额外闪烁路径。
        const pending = window.api?.systemTheme.apply('system') ?? Promise.resolve(null)
        void pending
          .catch(() => null)
          .then((result) => {
            // 较新的切换已发出时丢弃过期结果
            if (seq !== requestSeq.current) return
            if (!result) {
              // IPC 不可用 / 失败 / 返回 null：沿用当前已知系统明暗，不提交错误档位
              commitTheme('system', systemDark ? 'dark' : 'light')
              return
            }
            // 同一次 React 批次内校正权威明暗并提交档位，首帧解析值即正确
            setSystemDark(result.shouldUseDarkColors)
            commitTheme('system', result.resolvedTheme)
          })
        return
      }

      // 显式档：渲染层同步提交，主进程 themeSource 后台跟随（仅 Windows 生效），
      // 失败静默——渲染层主题不依赖该调用。
      void window.api?.systemTheme.apply(next)?.catch(() => {})
      commitTheme(next, resolveTheme(next, systemDark))
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
