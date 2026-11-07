import { useCallback } from 'react'
import type { Editor } from '@tiptap/core'
import { useTranslation } from 'react-i18next'
import { CATEGORY_LABEL_KEYS, isCategory } from '../../../components/dialogs/cleanWordsMeta'
import { FORESHADOW_ID_ATTR } from '../../../components/editor/foreshadowMarks'
import {
  useEditorMarkHover,
  type MarkHoverResolver,
  type MarkHoverState
} from '../../../components/editor/useMarkHover'
import { CLEAN_CATEGORY_ATTR, CLEAN_WORD_ATTR } from './proofreadMark'

/**
 * 违禁词命中标记（`.wf-clean-hit`）的悬停提示：词 + 类别。
 *
 * - 事件委托 / 延迟 / 文档变更收起全部复用 `useEditorMarkHover`，本 hook 只提供
 *   「`data-clean-word` → 三行内容」的解析；
 * - **同锚点优先级（伏笔优先）**：伏笔标记与违禁词都只改 `text-decoration`，同一段文字可能
 *   叠出嵌套 span。命中元素只要与伏笔标记同属一条锚点链（自身或**祖先**带
 *   `data-foreshadow-id`，或**后代**嵌着伏笔 span——ProseMirror 的装饰嵌套方向随区间
 *   起止位置而变），即返回 `null`，让伏笔浮层独占，避免两浮层完全重叠；
 * - 类别取同元素的 `data-clean-category`（枚举值缺省 / 非法时按 `other` 兜底）；
 * - 文案走 `chapters` ns：`cleanWords.hoverCategory` + `cleanWords.category.*`。
 */
export function useCleanWordHover(editor: Editor | null): MarkHoverState | null {
  const { t } = useTranslation('chapters')

  const resolve = useCallback<MarkHoverResolver>(
    (value, el) => {
      if (value === '') return null
      // 同锚点冲突：伏笔浮层优先（`closest` 含自身，另查后代覆盖装饰嵌套的两种方向）。
      if (el.closest(`[${FORESHADOW_ID_ATTR}]`) !== null) return null
      if (el.querySelector(`[${FORESHADOW_ID_ATTR}]`) !== null) return null
      const raw = el.getAttribute(CLEAN_CATEGORY_ATTR)
      const labelKey =
        raw !== null && isCategory(raw) ? CATEGORY_LABEL_KEYS[raw] : CATEGORY_LABEL_KEYS.other
      return {
        heading: value,
        status: t('cleanWords.hoverCategory', { category: t(labelKey) }),
        description: ''
      }
    },
    [t]
  )

  return useEditorMarkHover(editor, { attribute: CLEAN_WORD_ATTR, resolve })
}

export default useCleanWordHover
