import { randomUUID } from 'node:crypto'
import { logger } from '../logger'
import { AiFailure, toAiError } from './http'
import { deepseekProvider } from './providers/deepseek'
import { opencodeProvider } from './providers/opencode'
import type {
  AiChatMessage,
  AiChatOptions,
  AiListModelsOptions,
  AiProviderAdapter,
  AiProviderId,
  AiStreamListener,
  ResolvedAiChatOptions
} from './types'

/**
 * AI 能力层聚合入口。
 *
 * 分层：
 * - `config.ts`            配置与密钥（safeStorage）
 * - `modelCache.ts`        模型列表本地缓存（settings KV，12 小时 TTL）
 * - `http.ts`              OpenAI SDK 客户端 / 超时 / 错误归一化
 * - `providers/deepseek`   DeepSeek 官方 API（OpenAI 兼容）
 * - `providers/opencode`   opencode Go（OpenAI 兼容，需 `x-opencode-session` 头）
 *
 * 本文件按 `provider` 分发；不直接接触密钥明文，也不实现任何 UI / IPC。
 */

const log = logger.scope('ai')

const PROVIDERS: Record<AiProviderId, AiProviderAdapter> = {
  deepseek: deepseekProvider,
  opencode: opencodeProvider
}

export * from './types'
export { getAiConfig, getProviderBaseUrl, setAiConfig } from './config'
export { MODEL_CACHE_TTL_MS, readModelCache, writeModelCache } from './modelCache'

/** 取得适配器（运行时兜底，防止未来 IPC 传入非法值）。 */
function getAdapter(provider: AiProviderId): AiProviderAdapter {
  const adapter = PROVIDERS[provider]
  if (!adapter) {
    throw new AiFailure({ code: 'invalid_request', message: 'Unknown AI provider' })
  }
  return adapter
}

/**
 * 动态拉取指定服务商的模型 ID 列表。
 *
 * 失败时抛 `AiFailure`（携带脱敏 `AiError`），由上层决定如何呈现。
 */
export async function listModels(
  provider: AiProviderId,
  options: AiListModelsOptions = {}
): Promise<string[]> {
  return getAdapter(provider).listModels(options)
}

/**
 * 流式对话。
 *
 * `requestId` 缺省时自动生成；所有事件都带同一个 `requestId`，便于上层归位。
 * 本函数不会因上游异常而 reject——异常统一转换为 `{ type: 'error' }` 事件。
 */
export async function streamChat(
  provider: AiProviderId,
  messages: AiChatMessage[],
  options: AiChatOptions,
  onEvent: AiStreamListener
): Promise<void> {
  const requestId = options.requestId?.trim() || randomUUID()
  const resolved: ResolvedAiChatOptions = { ...options, requestId }

  try {
    await getAdapter(provider).streamChat(messages, resolved, onEvent)
  } catch (error) {
    const aiError = error instanceof AiFailure ? error.aiError : toAiError(error)
    log.warn('流式对话失败', { provider, code: aiError.code, status: aiError.status })
    onEvent({ type: 'error', requestId, error: aiError })
  }
}
