/**
 * 设置页 · AI 分区「模型」行（展示组件）。
 *
 * 只负责渲染：列表 / 手填两种模式、刷新与回列表按钮、加载 / 失败 / 空态提示。
 * 状态与落库逻辑在 `useAiModelList`，模型值写回由 `onChange` 交回页面。
 */
import { useTranslation } from 'react-i18next'
import { Button, Input, Select } from '../../components/ui'
import type { AiError } from '../../../../preload/types/ai'
import SettingRow from './SettingRow'
import { CUSTOM_MODEL_VALUE, ERROR_KEYS, type ModelsState } from './aiSectionSupport'
import type { ModelMode } from './useAiModelList'

export interface AiModelRowProps {
  /** 单点草稿中的模型字段。 */
  value: string
  models: string[]
  modelsState: ModelsState
  modelsError: AiError | null
  modelMode: ModelMode
  /** 配置未就绪时禁用全部控件。 */
  disabled: boolean
  /** 手填输入写回草稿。 */
  onChange: (value: string) => void
  /** 下拉选中（含「自定义」哨兵）。 */
  onSelect: (value: string) => void
  /** 手填失焦 / 回车提交。 */
  onCommit: () => void
  onRefresh: () => void
  /** 从手填切回列表。 */
  onUseList: () => void
}

export function AiModelRow({
  value,
  models,
  modelsState,
  modelsError,
  modelMode,
  disabled,
  onChange,
  onSelect,
  onCommit,
  onRefresh,
  onUseList
}: AiModelRowProps) {
  const { t } = useTranslation('ai')

  const modelErrorText =
    modelsState === 'error'
      ? t('model.failed', { message: t(ERROR_KEYS[modelsError?.code ?? 'unknown']) })
      : null

  const modelOptions = [
    ...models.map((model) => ({ value: model, label: model })),
    { value: CUSTOM_MODEL_VALUE, label: t('model.custom') }
  ]

  return (
    <SettingRow
      label={t('model.label')}
      description={
        <>
          {t('model.description')}
          {modelsState === 'loading' ? (
            <span className="ai-status">{t('model.loading')}</span>
          ) : null}
          {modelErrorText !== null ? (
            <span className="ai-status ai-status--error" role="alert">
              {modelErrorText}
            </span>
          ) : null}
          {modelsState === 'ready' && models.length === 0 ? (
            <span className="ai-status">{t('model.empty')}</span>
          ) : null}
        </>
      }
    >
      <div className="ai-control">
        {modelMode === 'custom' ? (
          <Input
            className="settings-control settings-control--wide"
            value={value}
            placeholder={t('model.placeholder')}
            aria-label={t('model.label')}
            spellCheck={false}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onCommit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onCommit()
              }
            }}
          />
        ) : (
          <Select
            className="settings-control settings-control--model"
            value={value}
            options={modelOptions}
            placeholder={t('model.placeholder')}
            ariaLabel={t('model.label')}
            disabled={disabled || modelsState === 'loading'}
            onChange={onSelect}
          />
        )}
        <Button
          size="sm"
          variant="ghost"
          loading={modelsState === 'loading'}
          disabled={disabled}
          onClick={onRefresh}
        >
          {t('model.refresh')}
        </Button>
        {modelMode === 'custom' && models.length > 0 ? (
          <Button size="sm" variant="ghost" disabled={disabled} onClick={onUseList}>
            {t('model.useList')}
          </Button>
        ) : null}
      </div>
    </SettingRow>
  )
}

AiModelRow.displayName = 'AiModelRow'

export default AiModelRow
