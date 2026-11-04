import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Editor } from '@tiptap/core'
import { toCssString } from '../../components/editor/richTextExtensions'
import { getQuotePool, randomQuoteIndex } from './quotes'

/**
 * 正文空态判定 + 诗句占位（章节编辑器 / 大纲编辑器共用，逻辑自两处原有实现原样上提）。
 *
 * 口径：
 * - **空态**由调用方传入的 `isEmptyDoc` 判定（章节「每段一个 paragraph」与大纲富文本
 *   的「有内容」口径不同，故谓词留在各域页面层）；
 * - **诗句**：进入空态 / 切换目标（`resetKey`）/ 停留期间每 ~10s 轮换一条 / 切换界面语言
 *   都会按当前语言池重新随机；`phase` 随轮换翻转，令 CSS 的 `animation-name` 变更以重启淡入；
 * - 只有空态存在定时器：转非空 / 卸载时清除，避免泄漏。
 */
const EMPTY_HINT_ROTATE_MS = 10000

export interface DocPlaceholderState {
  /** 当前正文是否为空态（调用方用于挂 `.is-empty`）。 */
  isEmpty: boolean
  /** 占位淡入相位（0 / 1 交替）。 */
  phase: number
  /** 直接透传给 `EditorContent` 的 style（经 CSS 变量传入占位文案）。 */
  docBodyStyle: CSSProperties
}

export function useDocPlaceholder(
  editor: Editor | null,
  isEmptyDoc: (editor: Editor) => boolean,
  /** 切换即重新随机诗句的键（章节 = chapterId；大纲 = contentId）。 */
  resetKey: number | string | null,
  /** 当前界面语言（决定诗句池）。 */
  language: string
): DocPlaceholderState {
  // 空态判定：监听 transaction（覆盖输入 / 选区 / setContent 切换等一切状态变更）。
  const [isEmpty, setIsEmpty] = useState(true)
  useEffect(() => {
    if (!editor) return undefined
    const sync = (): void => setIsEmpty(isEmptyDoc(editor))
    sync()
    editor.on('transaction', sync)
    editor.on('update', sync)
    return () => {
      editor.off('transaction', sync)
      editor.off('update', sync)
    }
  }, [editor, isEmptyDoc])

  // 空态提示轮换：进入空态 / 切换目标时随机一条；空状态停留期间每 ~10s 换一条。
  const [rotateTick, setRotateTick] = useState(0)
  useEffect(() => {
    if (!isEmpty) return undefined
    const timer = window.setInterval(() => setRotateTick((tick) => tick + 1), EMPTY_HINT_ROTATE_MS)
    return () => window.clearInterval(timer)
  }, [isEmpty])

  // 当前提示：依赖 [isEmpty, resetKey, rotateTick, language] 派生——进入空态 / 换目标 /
  // 每次轮换 / 切换界面语言都会按当前语言池重新随机一条；phase 随 rotateTick 翻转。
  // （isEmpty / resetKey 虽不直接参与取样，但必须在依赖中：换目标或由「有内容」回归空态时
  //   需重新随机，故此处显式引用以满足 exhaustive-deps。语言同理：切语言须换池重取。）
  const quote = useMemo(() => {
    void isEmpty
    void resetKey
    const pool = getQuotePool(language)
    return { index: randomQuoteIndex(-1, pool), pool, phase: rotateTick % 2 }
  }, [isEmpty, resetKey, rotateTick, language])

  const activeQuote = quote.pool[quote.index] ?? quote.pool[0]
  const placeholder = `${activeQuote.text} —— ${activeQuote.source}`
  const docBodyStyle = {
    '--editor-placeholder': toCssString(placeholder)
  } as CSSProperties

  return { isEmpty, phase: quote.phase, docBodyStyle }
}

export default useDocPlaceholder
