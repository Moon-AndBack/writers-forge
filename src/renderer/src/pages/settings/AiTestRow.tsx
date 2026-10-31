/**
 * 设置页 · AI 分区「测试连接」行（展示组件）。
 *
 * 只负责渲染：测试按钮与 idle / testing / ok / fail 四种状态提示。
 * 状态机与 IPC 调用在页面侧（`handleTest`），经 `onTest` 交回。
 */
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import SettingRow from './SettingRow'
import { ERROR_KEYS, type TestState } from './aiSectionSupport'

export interface AiTestRowProps {
  testState: TestState
  /** 配置未就绪时禁用。 */
  disabled: boolean
  onTest: () => void
}

export function AiTestRow({ testState, disabled, onTest }: AiTestRowProps) {
  const { t } = useTranslation('ai')

  return (
    <SettingRow
      label={t('test.label')}
      description={
        <>
          {t('test.description')}
          {testState.status === 'testing' ? (
            <span className="ai-status">{t('test.testing')}</span>
          ) : null}
          {testState.status === 'ok' ? (
            <span className="ai-status ai-status--ok">
              {t('test.success')} · {t('test.latency', { latency: testState.latencyMs })}
            </span>
          ) : null}
          {testState.status === 'fail' ? (
            <span className="ai-status ai-status--error" role="alert">
              {t('test.failed', { message: t(ERROR_KEYS[testState.error.code]) })}
            </span>
          ) : null}
        </>
      }
    >
      <Button
        size="sm"
        variant="secondary"
        loading={testState.status === 'testing'}
        disabled={disabled}
        onClick={onTest}
      >
        {t('test.button')}
      </Button>
    </SettingRow>
  )
}

AiTestRow.displayName = 'AiTestRow'

export default AiTestRow
