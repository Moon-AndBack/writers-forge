import { createContext, useContext } from 'react'

/**
 * 正文稿纸横线的共享状态：
 * `PaperLinesProvider` 持有唯一真源并把开关投影到
 * `document.documentElement.dataset.paperLines`，样式据此在章节 / 大纲编辑区
 * 与右栏只读正文的每行下方绘制虚线。设置页开关直接经 `useSettingsValue`
 * 写同一键，`useSettingsValue` 的同键广播会即时同步本 Provider。
 */

/** settings 表持久化键名（存 `'true' | 'false'` 字面字符串）。 */
export const PAPER_LINES_SETTING_KEY = 'paperLines'

/** 默认关闭，保持既有正文观感。 */
export const PAPER_LINES_DEFAULT = false

/** 仅 `'true'` 视为开启；缺省 / 非法 / `'false'` 一律回退关闭。 */
export function decodePaperLines(raw: string | null): boolean {
  return raw === 'true'
}

/** 是否开启稿纸横线（无 Provider 时回退默认关闭）。 */
export const PaperLinesContext = createContext<boolean>(PAPER_LINES_DEFAULT)

/** 读取稿纸横线开关。 */
export function usePaperLines(): boolean {
  return useContext(PaperLinesContext)
}
