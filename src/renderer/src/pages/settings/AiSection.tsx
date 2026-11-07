/**
 * 设置页 · AI 配置分区（数据只走 `window.api.ai`，不使用 useSettingsValue）。
 * 服务商 / Base URL / 模型随改随存；模型动态拉取，失败 / 为空自动切到手填。
 * 各服务商（DeepSeek / opencode）连接类控件一律可用；安全存储不可用时不保存密钥。
 *
 * 拆分说明：连接配置状态在 `useAiSettingsConfig`（`draft` 单点持有），模型列表状态在
 * `useAiModelList`，model / apiKey / test 三行渲染在各自的行组件；本文件只做组合。
 */
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Select } from '../../components/ui'
import type { AiProviderId } from '../../../../preload/types/ai'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { settingRowDescriptionId } from './settingRowIds'
import AiApiKeyRow from './AiApiKeyRow'
import AiCatalogRow from './AiCatalogRow'
import AiCompressionRow from './AiCompressionRow'
import AiModelRow from './AiModelRow'
import AiTestRow from './AiTestRow'
import { UNKNOWN_ERROR, type TestState } from './aiSectionSupport'
import { useAiModelList } from './useAiModelList'
import { useAiSettingsConfig } from './useAiSettingsConfig'

export default function AiSection() {
  const { t } = useTranslation('ai')
  const {
    config,
    draft,
    setDraft,
    apiKey,
    setApiKey,
    savingKey,
    clearingKey,
    persistConfig,
    flushConnection,
    handleSaveKey,
    handleClearKey,
    toastNode,
    hydrate
  } = useAiSettingsConfig()

  const {
    models,
    modelsState,
    modelsError,
    modelMode,
    loadModels,
    handleRefreshModels,
    handleModelSelect,
    commitModel,
    resetModelMode
  } = useAiModelList({
    provider: draft.provider,
    model: draft.model,
    persistedModel: config?.model ?? null,
    persistConfig,
    onModelChange: (model) => setDraft((current) => ({ ...current, model }))
  })

  const [testState, setTestState] = useState<TestState>({ status: 'idle' })
  const providerId = useId()
  const baseUrlId = useId()

  // 挂载时拉取一次配置（含掩码视图）；成功后自动拉模型列表。
  useEffect(() => {
    const api = window.api?.ai
    if (!api) return undefined
    let active = true
    api.config
      .get()
      .then((view) => {
        if (!active) return
        hydrate(view)
        void loadModels(view.provider, view.model)
      })
      .catch(() => {
        /* 读取失败保持禁用态，不额外打扰用户 */
      })
    return () => {
      active = false
    }
  }, [hydrate, loadModels])

  const handleProviderChange = (value: string): void => {
    const provider: AiProviderId = value === 'opencode' ? 'opencode' : 'deepseek'
    if (provider === draft.provider) return
    setDraft((current) => ({ ...current, provider }))
    setTestState({ status: 'idle' })
    resetModelMode()
    void (async () => {
      const next = await persistConfig({ provider })
      if (!next) {
        // 落库失败：回退到已生效配置，避免界面与主进程不一致。
        if (config)
          setDraft({ provider: config.provider, baseUrl: config.baseUrl, model: config.model })
        return
      }
      setDraft({ provider: next.provider, baseUrl: next.baseUrl, model: next.model })
      setApiKey('')
      await loadModels(next.provider, next.model)
    })()
  }

  const commitBaseUrl = (): void => {
    const next = draft.baseUrl.trim().replace(/\/+$/, '')
    setDraft((current) => ({ ...current, baseUrl: next }))
    if (config && next === config.baseUrl) return
    void persistConfig({ baseUrl: next })
  }

  const handleTest = (): void => {
    const api = window.api?.ai
    if (!api) return
    setTestState({ status: 'testing' })
    void (async () => {
      await flushConnection()
      try {
        const result = await api.test(draft.provider)
        if (result.ok) {
          setTestState({ status: 'ok', latencyMs: result.latencyMs })
        } else {
          setTestState({ status: 'fail', error: result.error ?? UNKNOWN_ERROR })
        }
      } catch {
        setTestState({ status: 'fail', error: UNKNOWN_ERROR })
      }
    })()
  }

  const isOpencode = draft.provider === 'opencode'
  const encryptionUnavailable = config !== null && !config.encryptionAvailable
  const connectionDisabled = config === null
  const keyInputDisabled = encryptionUnavailable

  return (
    <SectionCard title={t('section.title')} description={t('section.description')}>
      <SettingRow
        controlId={providerId}
        label={t('provider.label')}
        description={
          <>
            {t('provider.description')}
            {isOpencode ? <span className="ai-status">{t('provider.opencodeHint')}</span> : null}
          </>
        }
      >
        <Select
          id={providerId}
          ariaDescribedBy={settingRowDescriptionId(providerId)}
          size="sm"
          className="settings-control settings-control--select"
          value={draft.provider}
          options={[
            { value: 'deepseek', label: t('provider.deepseek') },
            { value: 'opencode', label: t('provider.opencode') }
          ]}
          ariaLabel={t('provider.label')}
          disabled={config === null}
          onChange={handleProviderChange}
        />
      </SettingRow>

      <SettingRow
        controlId={baseUrlId}
        label={t('baseUrl.label')}
        description={
          <>
            {t('baseUrl.description')}
            <span className="ai-status">{t('baseUrl.hint')}</span>
          </>
        }
      >
        <Input
          id={baseUrlId}
          aria-describedby={settingRowDescriptionId(baseUrlId)}
          size="sm"
          className="settings-control settings-control--wide"
          value={draft.baseUrl}
          placeholder={t(isOpencode ? 'baseUrl.placeholderOpencode' : 'baseUrl.placeholder')}
          aria-label={t('baseUrl.label')}
          inputMode="url"
          spellCheck={false}
          autoComplete="off"
          disabled={connectionDisabled}
          onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
          onBlur={commitBaseUrl}
        />
      </SettingRow>

      <AiModelRow
        value={draft.model}
        models={models}
        modelsState={modelsState}
        modelsError={modelsError}
        modelMode={modelMode}
        disabled={connectionDisabled}
        onChange={(model) => setDraft((current) => ({ ...current, model }))}
        onSelect={handleModelSelect}
        onCommit={commitModel}
        onRefresh={handleRefreshModels}
        onUseList={resetModelMode}
      />

      <AiCatalogRow />

      <AiCompressionRow />

      <AiApiKeyRow
        value={apiKey}
        onChange={setApiKey}
        hasKey={config?.hasKey ?? false}
        keyMasked={config?.keyMasked ?? ''}
        encryptionUnavailable={encryptionUnavailable}
        isOpencode={isOpencode}
        inputDisabled={keyInputDisabled}
        clearDisabled={config === null || !config.hasKey}
        saving={savingKey}
        clearing={clearingKey}
        onSave={handleSaveKey}
        onClear={handleClearKey}
      />

      <AiTestRow testState={testState} disabled={connectionDisabled} onTest={handleTest} />

      {toastNode}
    </SectionCard>
  )
}
