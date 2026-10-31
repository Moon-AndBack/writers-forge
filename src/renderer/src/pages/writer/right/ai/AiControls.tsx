import { useTranslation } from 'react-i18next'
import { Button, Select } from '../../../../components/ui'
import type { SelectOption } from '../../../../components/ui'
import type { AiComposeAction } from './functions'

export interface AiControlsProps {
  /** 本面板生效的模型（全局当前或临时覆盖）。 */
  model: string
  modelOptions: SelectOption[]
  onModelChange: (value: string) => void
  /** 当前功能（含自由对话）。 */
  action: AiComposeAction
  actionOptions: SelectOption[]
  onActionChange: (value: AiComposeAction) => void
  carryFull: boolean
  carrySelection: boolean
  onToggleCarryFull: () => void
  onToggleCarrySelection: () => void
  generating: boolean
  canSend: boolean
  onSend: () => void
  onAbort: () => void
}

/**
 * AI 面板控件行：模型 / 功能 / 两个上下文切换 / 发送（生成中变「停止」）。
 *
 * 从 `AiPanel` 拆出（单文件 500 行硬约束，AGENTS §3）：本组件只管这一行控件的
 * 布局与文案，状态与请求逻辑仍由 `AiPanel` 持有（受控）。
 * 样式见 `styles/writer-ai.css` 的 `.ai-panel__controls`（窄栏自动换行）。
 */
export function AiControls({
  model,
  modelOptions,
  onModelChange,
  action,
  actionOptions,
  onActionChange,
  carryFull,
  carrySelection,
  onToggleCarryFull,
  onToggleCarrySelection,
  generating,
  canSend,
  onSend,
  onAbort
}: AiControlsProps) {
  const { t } = useTranslation('ai')

  return (
    <div className="ai-panel__controls">
      <Select
        className="ai-panel__model"
        size="sm"
        value={model}
        options={modelOptions}
        placeholder={t('panel.model.label')}
        ariaLabel={t('panel.model.aria')}
        emptyText={t('panel.model.empty')}
        disabled={modelOptions.length === 0}
        onChange={onModelChange}
      />
      <Select
        className="ai-panel__action"
        size="sm"
        value={action}
        options={actionOptions}
        ariaLabel={t('panel.action.label')}
        onChange={(value) => onActionChange(value as AiComposeAction)}
      />
      <div className="ai-panel__carry">
        <Button size="sm" aria-pressed={carryFull} onClick={onToggleCarryFull}>
          {t('panel.carry.full')}
        </Button>
        <Button size="sm" aria-pressed={carrySelection} onClick={onToggleCarrySelection}>
          {t('panel.carry.selection')}
        </Button>
      </div>
      {generating ? (
        <Button size="sm" variant="danger" onClick={onAbort}>
          {t('panel.stop')}
        </Button>
      ) : (
        <Button size="sm" variant="primary" disabled={!canSend} onClick={onSend}>
          {t('panel.chat.send')}
        </Button>
      )}
    </div>
  )
}

export default AiControls
