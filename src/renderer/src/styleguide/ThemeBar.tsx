import { useEffect, useState } from 'react'
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
  THEME_OPTIONS,
  type StyleguideThemeId
} from './theme'

/**
 * 顶部主题条：五档按钮，选中态用品牌色 + 面板底。
 * 「跟随系统」在应用时解析成 light / dark，并监听系统配色变化实时重解析。
 */
export function ThemeBar() {
  const [theme, setTheme] = useState<StyleguideThemeId>(() => readStoredTheme())
  // 系统配色变化时刷新「实际生效值」标签：resolved 在渲染期计算，不额外存 state。
  const [, bumpResolved] = useState(0)
  const resolved = resolveTheme(theme)

  useEffect(() => {
    applyTheme(theme)
    storeTheme(theme)

    if (theme !== 'system' || typeof window.matchMedia !== 'function') return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => {
      applyTheme('system')
      bumpResolved((value) => value + 1)
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  return (
    <div className="sg-theme-bar" role="group" aria-label="主题切换">
      {THEME_OPTIONS.map((option) => {
        const active = option.id === theme
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            className={active ? 'sg-theme-btn is-active' : 'sg-theme-btn'}
            onClick={() => setTheme(option.id)}
          >
            {option.label}
          </button>
        )
      })}
      <span className="sg-theme-resolved" title="当前写入 html[data-theme] 的值">
        data-theme = <code className="sg-code">{resolved}</code>
      </span>
    </div>
  )
}

export default ThemeBar
