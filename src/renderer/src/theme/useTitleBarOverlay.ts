import { useEffect } from 'react'
import { useTheme } from './useTheme'

/** 需与 CSS `.titlebar` 高度 / 主进程 titleBarOverlay.height 一致。 */
const OVERLAY_HEIGHT = 42

/** overlay 背景保持全透明，让自绘标题栏背景 / DWM 材质透出。 */
const OVERLAY_COLOR = '#00000000'

/** 读取主题令牌中用于窗口控制按钮的符号色，失败回退 Electron 初始值。 */
function readSymbolColor(): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--text-dim').trim()
    return value || '#5c5c5c'
  } catch {
    return '#5c5c5c'
  }
}

/** 调用主进程同步 overlay；无 Electron API 或调用失败时静默跳过。 */
function applyOverlay(): void {
  const api = window.api?.titleBar
  if (!api) return
  try {
    void api
      .setOverlay({
        color: OVERLAY_COLOR,
        symbolColor: readSymbolColor(),
        height: OVERLAY_HEIGHT
      })
      .catch(() => {
        /* IPC 失败静默忽略：不影响渲染层 UI */
      })
  } catch {
    /* 同步异常（如接口缺失）静默忽略 */
  }
}

/**
 * 把主题变化同步到系统标题栏 overlay（Window Controls Overlay）：
 * theme 变化时读取 `--text-dim` 的实际色值作为 symbolColor。
 * 非 Electron 环境（window.api?.titleBar 不存在）静默跳过。
 */
export function useTitleBarOverlay(): void {
  const { theme } = useTheme()

  useEffect(() => {
    // ThemeProvider 的 effect 在子组件之后写 dataset.theme，
    // 故延后一帧再读取，确保取到新主题下的 --text-dim。
    const raf = requestAnimationFrame(applyOverlay)

    return () => {
      cancelAnimationFrame(raf)
    }
  }, [theme])
}
