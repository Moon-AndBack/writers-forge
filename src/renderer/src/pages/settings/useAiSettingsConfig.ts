/**
 * 设置页 · AI 分区「连接配置」hook。
 *
 * 单点持有 `draft`（provider / baseUrl / model 三者共用一份 state）、`config` 与
 * `apiKey`；负责落库（`persistConfig` / `flushConnection`）与密钥保存 / 清除。
 * 挂载取配置在页面侧完成，取到后调用 `hydrate` 填充状态（模型列表由
 * `useAiModelList` 负责）。
 */
import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiConfigView } from '../../../../preload/types/ai'
import { useToast } from '../../components/ui'
import {
  INITIAL_DRAFT,
  createPersistConfig,
  type ConnectionDraft,
  type PersistConfig
} from './aiSectionSupport'

export interface AiSettingsConfigController {
  config: AiConfigView | null
  /** 连接字段草稿（单点持有，唯一副本）。 */
  draft: ConnectionDraft
  setDraft: Dispatch<SetStateAction<ConnectionDraft>>
  apiKey: string
  setApiKey: Dispatch<SetStateAction<string>>
  savingKey: boolean
  clearingKey: boolean
  /** 共享落库函数（`useAiModelList` 亦复用同一实例）。 */
  persistConfig: PersistConfig
  /** 把草稿中的连接字段落库（测试 / 刷新前调用，保证读到最新输入）。 */
  flushConnection: () => Promise<void>
  handleSaveKey: () => void
  handleClearKey: () => void
  /** 提示节点（保存 / 清除密钥、落库失败共用同一个 Toast）。 */
  toastNode: ReactNode
  /** 用主进程返回的配置填充 `config` 与 `draft`（挂载读取成功后调用）。 */
  hydrate: (view: AiConfigView) => void
}

export function useAiSettingsConfig(): AiSettingsConfigController {
  const { t } = useTranslation('ai')
  const { show: showToast, node: toastNode } = useToast()

  const [config, setConfig] = useState<AiConfigView | null>(null)
  const [draft, setDraft] = useState<ConnectionDraft>(INITIAL_DRAFT)
  const [apiKey, setApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [clearingKey, setClearingKey] = useState(false)

  // 落库函数以展示回调为依赖构造；同时供模型 hook 复用（不复制实现）。
  const persistConfig = useMemo(
    () =>
      createPersistConfig({
        setConfig,
        onError: () => showToast(t('error.unknown'))
      }),
    [showToast, t]
  )

  const hydrate = useCallback((view: AiConfigView): void => {
    setConfig(view)
    setDraft({ provider: view.provider, baseUrl: view.baseUrl, model: view.model })
  }, [])

  const flushConnection = useCallback(async (): Promise<void> => {
    await persistConfig({
      provider: draft.provider,
      baseUrl: draft.baseUrl.trim(),
      model: draft.model.trim()
    })
  }, [draft, persistConfig])

  const handleSaveKey = (): void => {
    const api = window.api?.ai
    const value = apiKey.trim()
    if (!api || value === '' || savingKey) return
    setSavingKey(true)
    void api.config
      .set({ apiKey: value })
      .then((result) => {
        setConfig(result.config)
        if (result.apiKeyError === 'encryption_unavailable') {
          showToast(t('apiKey.encryptionUnavailable'))
        } else if (result.apiKeyStored) {
          setApiKey('')
          showToast(t('apiKey.savedToast'))
        } else {
          showToast(t('apiKey.saveFailed'))
        }
      })
      .catch(() => showToast(t('apiKey.saveFailed')))
      .finally(() => setSavingKey(false))
  }

  const handleClearKey = (): void => {
    const api = window.api?.ai
    if (!api || clearingKey) return
    setClearingKey(true)
    void api.config
      .set({ apiKey: '' })
      .then((result) => {
        setConfig(result.config)
        if (result.apiKeyError !== undefined) {
          showToast(t('apiKey.saveFailed'))
        } else {
          setApiKey('')
          showToast(t('apiKey.clearedToast'))
        }
      })
      .catch(() => showToast(t('apiKey.saveFailed')))
      .finally(() => setClearingKey(false))
  }

  return {
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
  }
}
