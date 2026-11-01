/**
 * 设置页 · AI 分区「模型列表」hook。
 *
 * 只接收 `provider` / `model`（来自 `useAiSettingsConfig` 的单点草稿）作为入参，
 * **不持有草稿**：模型变更经 `onModelChange` 写回草稿，落库复用共享的
 * `persistConfig`。列表请求带序号，快速切换服务商时丢弃过期响应。
 */
import { useCallback, useRef, useState } from 'react'
import type { AiError, AiProviderId } from '../../../../preload/types/ai'
import { CUSTOM_MODEL_VALUE, type ModelsState, type PersistConfig } from './aiSectionSupport'

export type ModelMode = 'list' | 'custom'

export interface UseAiModelListOptions {
  /** 当前草稿中的服务商。 */
  provider: AiProviderId
  /** 当前草稿中的模型。 */
  model: string
  /** 已落库的模型（`config.model`）；配置未就绪时为 null。 */
  persistedModel: string | null
  /** 与连接配置 hook 共享的落库函数。 */
  persistConfig: PersistConfig
  /** 刷新 / 测试前的草稿落库。 */
  flushConnection: () => Promise<void>
  /** 把模型写回单点草稿（本 hook 不持有草稿本体）。 */
  onModelChange: (model: string) => void
}

export interface AiModelListController {
  models: string[]
  modelsState: ModelsState
  modelsError: AiError | null
  modelMode: ModelMode
  loadModels: (provider: AiProviderId, currentModel: string) => Promise<void>
  handleRefreshModels: () => void
  handleModelSelect: (value: string) => void
  commitModel: () => void
  /** 回到列表模式（服务商切换时调用）。 */
  resetModelMode: () => void
}

export function useAiModelList({
  provider,
  model,
  persistedModel,
  persistConfig,
  flushConnection,
  onModelChange
}: UseAiModelListOptions): AiModelListController {
  const [models, setModels] = useState<string[]>([])
  const [modelsState, setModelsState] = useState<ModelsState>('idle')
  const [modelsError, setModelsError] = useState<AiError | null>(null)
  const [modelMode, setModelMode] = useState<ModelMode>('list')

  /** 模型列表请求序号：快速切换服务商时丢弃过期响应。 */
  const modelsSeq = useRef(0)

  const loadModels = useCallback(
    async (nextProvider: AiProviderId, currentModel: string): Promise<void> => {
      const api = window.api?.ai
      if (!api) return
      const seq = modelsSeq.current + 1
      modelsSeq.current = seq
      setModelsState('loading')
      setModelsError(null)
      setModels([])
      try {
        const result = await api.models.list(nextProvider)
        if (seq !== modelsSeq.current) return
        if (result.ok) {
          const list = result.models ?? []
          setModels(list)
          setModelsState('ready')
          // 当前模型不在列表内（或列表为空）时直接进入手填模式。
          if (list.length === 0 || (currentModel !== '' && !list.includes(currentModel))) {
            setModelMode('custom')
          }
        } else {
          setModelsState('error')
          setModelsError(result.error ?? null)
          setModelMode('custom')
        }
      } catch {
        if (seq !== modelsSeq.current) return
        setModelsState('error')
        setModelsError(null)
        setModelMode('custom')
      }
    },
    []
  )

  const handleRefreshModels = (): void => {
    void (async () => {
      await flushConnection()
      await loadModels(provider, model)
    })()
  }

  const handleModelSelect = (value: string): void => {
    if (value === CUSTOM_MODEL_VALUE) {
      setModelMode('custom')
      return
    }
    setModelMode('list')
    onModelChange(value)
    void persistConfig({ model: value })
  }

  const commitModel = (): void => {
    const next = model.trim()
    onModelChange(next)
    if (persistedModel !== null && next === persistedModel) return
    void persistConfig({ model: next })
  }

  const resetModelMode = (): void => {
    setModelMode('list')
  }

  return {
    models,
    modelsState,
    modelsError,
    modelMode,
    loadModels,
    handleRefreshModels,
    handleModelSelect,
    commitModel,
    resetModelMode
  }
}
