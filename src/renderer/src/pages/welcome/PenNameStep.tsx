import { useTranslation } from 'react-i18next'
import { FormField, Input } from '../../components/ui'

/** 建议笔名上限（超出仅提示，不阻断提交）。 */
export const PEN_NAME_MAX = 24

/** 输入硬上限，高于建议值，以便能展示「超长」软提示。 */
const INPUT_MAX_LENGTH = 64

export interface PenNameStepProps {
  /** 当前输入值。 */
  value: string
  /** 输入变化回调。 */
  onChange: (value: string) => void
  /** 提交（Enter 或底部按钮）：交由父级尝试完成本步。 */
  onSubmit: () => void
  /** 已尝试提交但未通过校验：用于展示错误态。 */
  showError: boolean
  /** 保存中：禁用输入。 */
  disabled?: boolean
}

/**
 * 步骤 1：笔名。
 * 校验：去空白后非空方可提交；超过 {@link PEN_NAME_MAX} 字给出软提示（不阻断）。
 */
export default function PenNameStep({
  value,
  onChange,
  onSubmit,
  showError,
  disabled = false
}: PenNameStepProps) {
  const { t } = useTranslation('welcome')
  const trimmed = value.trim()
  const empty = trimmed.length === 0
  const tooLong = trimmed.length > PEN_NAME_MAX
  const invalid = showError && empty

  return (
    <div className="wf-welcome__panel">
      <FormField
        label={t('penName.label')}
        htmlFor="wf-pen-name"
        required
        hint={t('penName.hint')}
        error={invalid ? t('penName.errorRequired') : undefined}
      >
        <Input
          id="wf-pen-name"
          value={value}
          autoFocus
          autoComplete="off"
          placeholder={t('penName.placeholder')}
          invalid={invalid}
          maxLength={INPUT_MAX_LENGTH}
          disabled={disabled}
          aria-describedby="wf-pen-name-message"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
        />
      </FormField>

      {tooLong ? (
        <p className="wf-welcome__warn" role="status">
          {t('penName.tooLong', { count: trimmed.length, max: PEN_NAME_MAX })}
        </p>
      ) : null}
    </div>
  )
}
