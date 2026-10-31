import { useEffect, useLayoutEffect, useState } from 'react'
import { deriveBrand2 } from './color'
import type { ResolvedThemeId } from './themes'

const BRAND_VAR = '--brand'
const BRAND_VAR_2 = '--brand-2'

/**
 * 系统强调色只作用于 light / dark（含 `system` 解析结果）。
 * sage / honey 等预设主题保留 `theme.css` 中各自的静态品牌色。
 */
function shouldUseAccent(resolvedTheme: ResolvedThemeId): boolean {
  return resolvedTheme === 'light' || resolvedTheme === 'dark'
}

function applyAccent(color: string): void {
  const root = document.documentElement
  root.style.setProperty(BRAND_VAR, color)
  // `--brand-2` 由强调色派生，保证渐变两端仍是一对协调色
  root.style.setProperty(BRAND_VAR_2, deriveBrand2(color))
}

/** 清除内联覆盖，让 `theme.css` 的静态品牌色重新生效。 */
function clearAccent(): void {
  const style = document.documentElement.style
  style.removeProperty(BRAND_VAR)
  style.removeProperty(BRAND_VAR_2)
}

/**
 * 读取并订阅主进程提供的系统强调色。
 * 非 Electron 环境（无 `window.api.systemTheme`）静默跳过，保持 null。
 */
function useAccentColor(): string | null {
  const [accent, setAccent] = useState<string | null>(null)

  useEffect(() => {
    const api = window.api?.systemTheme
    if (!api) return

    let active = true
    api
      .getAccentColor()
      .then((color) => {
        if (active) setAccent(color)
      })
      .catch(() => {
        /* IPC 失败静默忽略：保留主题自带品牌色 */
      })

    const unsubscribe = api.onAccentChange((color) => {
      if (active) setAccent(color)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return accent
}

/**
 * 把系统强调色写入 `documentElement` 的 `--brand` / `--brand-2` 内联覆盖。
 *
 * - 生效主题为 light / dark：取到有效强调色则覆盖；
 * - 生效主题为 sage / honey（或强调色不可用）：清除内联覆盖，回退 `theme.css` 静态色。
 *
 * 订阅常驻（不随主题切换重建），因此从 sage / honey 切回 light / dark 时会
 * 立即用已缓存的最新强调色重新覆盖；系统改色时经 `onAccentChange` 实时更新。
 *
 * 应用走 `useLayoutEffect` 而非 `useEffect`：主题切换由 View Transition 拍快照，
 * `--brand` 的内联覆盖必须随同一次 commit 落地，否则新快照会短暂拍到
 * `theme.css` 的静态品牌色，过渡结束后再硬跳成系统强调色。
 */
export function useSystemAccent(resolvedTheme: ResolvedThemeId): void {
  const accent = useAccentColor()

  useLayoutEffect(() => {
    if (shouldUseAccent(resolvedTheme) && accent) {
      applyAccent(accent)
    } else {
      clearAccent()
    }
  }, [resolvedTheme, accent])
}
