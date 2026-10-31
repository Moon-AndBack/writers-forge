import { useEffect, type ReactNode } from 'react'
import { applyChipColors } from './chipColorInject'

/**
 * 胶囊配色 Provider：挂载时从 `chip_colors` 表读一次全局配色，注入为类规则。
 *
 * - 配色是**全局配置**，不随书 / 主题变化，故依赖数组为 `[]`，只读一次；
 * - 读取失败（无 Electron API / IPC 异常）静默跳过，保留 CSS 静态兜底配色，不阻塞渲染；
 * - 注入本身幂等（整体替换 `<style>` 的 textContent），StrictMode 双执行也安全。
 */
export function ChipColorProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false
    void window.api?.chipColors
      .list()
      .then((rows) => {
        if (cancelled) return
        applyChipColors(rows)
      })
      .catch(() => {
        /* 读取失败时保持 CSS 静态兜底配色，不阻塞渲染 */
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
