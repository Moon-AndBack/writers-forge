import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useSettingsValue } from '../pages/settings/useSettingsValue'
import {
  PAPER_LINES_DEFAULT,
  PAPER_LINES_SETTING_KEY,
  PaperLinesContext,
  decodePaperLines
} from './paperLines'

/**
 * 正文稿纸横线 Provider：包裹窗口外壳（App 层）。
 *
 * - 真源为 `useSettingsValue('paperLines')`，设置页开关写同一键后经同键广播即时同步；
 * - `enabled` 投影到 `document.documentElement.dataset.paperLines`（`'true' | 'false'`），
 *   样式只在该属性为 `'true'` 时生效；
 * - 首帧开关态由 `main.tsx` 启动预取并作为 `initialEnabled` 传入，且在 `createRoot`
 *   前预写同值 dataset 属性，避免异步读取导致的虚线闪烁。
 */
export function PaperLinesProvider({
  children,
  initialEnabled = PAPER_LINES_DEFAULT
}: {
  children: ReactNode
  /** 启动预取（main.tsx 读 `paperLines`）解析出的首帧开关态，缺省关闭。 */
  initialEnabled?: boolean
}) {
  const { value: enabled } = useSettingsValue(
    PAPER_LINES_SETTING_KEY,
    initialEnabled,
    decodePaperLines
  )

  // enabled → html[data-paper-lines]（写入同值属空操作）
  useEffect(() => {
    document.documentElement.dataset.paperLines = enabled ? 'true' : 'false'
  }, [enabled])

  return <PaperLinesContext.Provider value={enabled}>{children}</PaperLinesContext.Provider>
}

export default PaperLinesProvider
