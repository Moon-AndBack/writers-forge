/**
 * 设置页 · AI 分区「API Key」行（展示组件）。
 *
 * 只负责渲染：密码输入、保存 / 清除按钮与密钥状态提示。保存 / 清除逻辑在
 * `useAiSettingsConfig`，经 `onSave` / `onClear` 交回页面。
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '../../components/ui'
import SettingRow from './SettingRow'
import { settingRowDescriptionId } from './settingRowIds'

export interface AiApiKeyRowProps {
  value: string
  onChange: (value: string) => void
  /** 是否已保存密钥。 */
  hasKey: boolean
  /** 掩码密钥（不可解密时为空串）。 */
  keyMasked: string
  /** 当前环境不支持安全存储。 */
  encryptionUnavailable: boolean
  /** 当前服务商为 opencode（展示专属提示）。 */
  isOpencode: boolean
  /** 输入框禁用（加密不可用）。 */
  inputDisabled: boolean
  /** 清除按钮禁用（配置未就绪或尚无密钥）。 */
  clearDisabled: boolean
  saving: boolean
  clearing: boolean
  onSave: () => void
  onClear: () => void
}

export function AiApiKeyRow({
  value,
  onChange,
  hasKey,
  keyMasked,
  encryptionUnavailable,
  isOpencode,
  inputDisabled,
  clearDisabled,
  saving,
  clearing,
  onSave,
  onClear
}: AiApiKeyRowProps) {
  const { t } = useTranslation('ai')
  const apiKeyControlId = useId()

  const keyHint = ((): { text: string; tone: 'ok' | 'warn' } | null => {
    if (encryptionUnavailable) return { text: t('apiKey.encryptionUnavailable'), tone: 'warn' }
    if (hasKey && keyMasked !== '') {
      return { text: t('apiKey.saved', { masked: keyMasked }), tone: 'ok' }
    }
    if (isOpencode) return { text: t('apiKey.opencodeHint'), tone: 'warn' }
    return null
  })()

  return (
    <SettingRow
      controlId={apiKeyControlId}
      className="settings-row--stack"
      label={t('apiKey.label')}
      description={
        <>
          {t('apiKey.description')}
          {keyHint !== null ? (
            <span className={`ai-status ai-status--${keyHint.tone}`}>{keyHint.text}</span>
          ) : null}
        </>
      }
    >
      <div className="ai-control">
        <Input
          id={apiKeyControlId}
          aria-describedby={settingRowDescriptionId(apiKeyControlId)}
          type="password"
          className="settings-control settings-control--wide"
          value={value}
          placeholder={
            hasKey && keyMasked !== ''
              ? t('apiKey.placeholderSaved', { masked: keyMasked })
              : t('apiKey.placeholder')
          }
          aria-label={t('apiKey.label')}
          spellCheck={false}
          autoComplete="off"
          disabled={inputDisabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onSave()
            }
          }}
        />
        <Button
          variant="primary"
          loading={saving}
          disabled={inputDisabled || value.trim() === ''}
          onClick={onSave}
        >
          {t('apiKey.save')}
        </Button>
        <Button variant="ghost" loading={clearing} disabled={clearDisabled} onClick={onClear}>
          {t('apiKey.clear')}
        </Button>
      </div>
    </SettingRow>
  )
}

AiApiKeyRow.displayName = 'AiApiKeyRow'

export default AiApiKeyRow
