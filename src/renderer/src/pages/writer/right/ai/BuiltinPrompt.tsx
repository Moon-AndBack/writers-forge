import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Switch } from '../../../../components/ui'

export interface BuiltinPromptProps {
  /** 是否启用（受控）。 */
  enabled: boolean
  onToggle: (next: boolean) => void
  /** 拼好的提示词（空串时整块不渲染）。 */
  text: string
  /** 无分类时用基础提示词，开关仍可用。 */
  hasCategories: boolean
}

/**
 * 「携带内置提示词」开关 + 提示词预览（位于输入框上方）。
 *
 * - 文本默认限 2 行（省略号），带 `title` 悬浮全文，可点「展开」看完整约束——
 *   风格句可能多条、每条 15~30 字，全量铺开会把输入区顶出可视范围；
 * - 未启用时只留开关行（不显示文本，也不占高度）；
 * - 仅改颜色 / 描边，无 transform（AGENTS §8）。
 */
export function BuiltinPrompt({ enabled, onToggle, text, hasCategories }: BuiltinPromptProps) {
  const { t } = useTranslation('ai')
  const [expanded, setExpanded] = useState(false)

  // 无书 / 加载中 / 读取失败：不渲染整块（避免空壳占位）。
  if (text === '') return null

  return (
    <div className="ai-panel__builtin">
      <div className="ai-panel__builtin-head">
        <Switch
          size="sm"
          checked={enabled}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          label={t('panel.builtin.toggle')}
        />
        {hasCategories ? null : (
          <span className="ai-panel__builtin-note">{t('panel.builtin.baseHint')}</span>
        )}
        {enabled ? (
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t('panel.builtin.collapse') : t('panel.builtin.expand')}
          </Button>
        ) : null}
      </div>
      {enabled ? (
        <p
          className={expanded ? 'ai-panel__builtin-text is-expanded' : 'ai-panel__builtin-text'}
          title={text}
        >
          {text}
        </p>
      ) : null}
    </div>
  )
}

export default BuiltinPrompt
