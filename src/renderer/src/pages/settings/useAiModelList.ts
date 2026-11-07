/**
 * 设置页 · AI 分区「模型列表」hook。
 *
 * 只接收 `provider` / `model`（来自 `useAiSettingsConfig` 的单点草稿）作为入参，
 * **不持有草稿**：模型变更经 `onModelChange` 写回草稿，落库复用共享的
 * `persistConfig`。列表请求带序号，快速切换服务商时丢弃过期响应。
 *
 * 加载策略（与主进程 `ai:models:list` 的 `mode` 配套）：
 * - 先读缓存（`mode: 'cache'`），命中即渲染，不联网、不先清空列表；
 * - 缓存缺失或已过期（`stale`）时再后台联网刷新；后台刷新失败保留旧列表且不改错误态；
 * - 手动「刷新」强制联网（`mode: 'refresh'`），**不落库草稿**。
 */
import { useCallback, useRef, useState } from 'react'
import type { AiError, AiProviderId } from '../../../../preload/types/ai'
import { invalidateLimitCache } from '../writer/right/ai/useContextUsage'
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
  onModelChange
}: UseAiModelListOptions): AiModelListController {
  const [models, setModels] = useState<string[]>([])
  const [modelsState, setModelsState] = useState<ModelsState>('idle')
  const [modelsError, setModelsError] = useState<AiError | null>(null)
  const [modelMode, setModelMode] = useState<ModelMode>('list')

  /** 模型列表请求序号：快速切换服务商时丢弃过期响应。 */
  const modelsSeq = useRef(0)
  /** 当前列表快照：判断「失败时是否已有内容可留」不依赖闭包里的旧 state。 */
  const modelsRef = useRef<string[]>([])

  /** 采纳一份列表：置 ready、清错误；当前模型不在列表内时落到手填模式（模型值不动）。 */
  const applyModels = useCallback((list: string[], currentModel: string): void => {
    modelsRef.current = list
    setModels(list)
    setModelsState('ready')
    setModelsError(null)
    if (list.length === 0 || (currentModel !== '' && !list.includes(currentModel))) {
      setModelMode('custom')
    }
  }, [])

  /**
   * 联网刷新。
   *
   * `silent = true`：后台刷新——成功则悄悄替换列表，失败不改任何状态、不清列表；
   * `silent = false`：首次加载无缓存 / 手动刷新——展示 loading 与失败信息，但仍不清空已有列表。
   */
  const refreshModels = useCallback(
    async (nextProvider: AiProviderId, currentModel: string, silent: boolean): Promise<void> => {
      const api = window.api?.ai
      if (!api) return
      const seq = modelsSeq.current + 1
      modelsSeq.current = seq
      if (!silent) {
        setModelsState('loading')
        setModelsError(null)
      }
      try {
        const result = await api.models.list(nextProvider, 'refresh')
        if (seq !== modelsSeq.current) return

        const list = result.models ?? []
        if (result.ok && list.length > 0) {
          applyModels(list, currentModel)
          // 新列表可能带来新的自报窗口：清空渲染层窗口缓存，占用条按新窗口重算。
          invalidateLimitCache()
          return
        }
        if (result.ok) {
          // 联网成功但为空：不写缓存、不覆盖已有列表；仅在本来就空时展示空态。
          if (!silent && modelsRef.current.length === 0) {
            applyModels([], currentModel)
          }
          return
        }

        // 失败：保留旧列表；后台刷新完全静默。
        if (silent) return
        setModelsState('error')
        setModelsError(result.error ?? null)
        if (modelsRef.current.length === 0) setModelMode('custom')
      } catch {
        if (seq !== modelsSeq.current) return
        if (silent) return
        setModelsState('error')
        setModelsError(null)
        if (modelsRef.current.length === 0) setModelMode('custom')
      }
    },
    [applyModels]
  )

  const loadModels = useCallback(
    async (nextProvider: AiProviderId, currentModel: string): Promise<void> => {
      const api = window.api?.ai
      if (!api) return
      const seq = modelsSeq.current + 1
      modelsSeq.current = seq

      let cached = false
      let stale = false
      try {
        const result = await api.models.list(nextProvider, 'cache')
        if (seq !== modelsSeq.current) return
        if (result.ok && (result.models?.length ?? 0) > 0) {
          applyModels(result.models ?? [], currentModel)
          cached = true
          stale = result.stale === true
        }
      } catch {
        // 缓存读取异常按未命中处理：继续走联网刷新。
      }

      if (seq !== modelsSeq.current) return
      // 缓存新鲜：直接收工；过期则后台静默刷新（保留已渲染的列表）。
      if (cached && !stale) return
      await refreshModels(nextProvider, currentModel, cached)
    },
    [applyModels, refreshModels]
  )

  /** 手动刷新：强制联网，且不把草稿里的 provider / baseUrl / model 顺带落库。 */
  const handleRefreshModels = (): void => {
    void refreshModels(provider, model, false)
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
