import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getProviderConnection } from '../config'
import { AiFailure, createAiClient, createRequestSignal, toAiError } from '../http'
import { logger } from '../../logger'
import type {
  AiChatMessage,
  AiListModelsOptions,
  AiModelInfo,
  AiProviderAdapter,
  AiStreamListener,
  AiUsage,
  ResolvedAiChatOptions
} from '../types'

/**
 * DeepSeek 官方 API 适配器（OpenAI 兼容）。
 *
 * 约束：
 * - 模型 ID 一律由调用方参数（或 settings）传入，本文件不硬编码任何模型名；
 * - Base URL 支持自定义中转站；
 * - 所有异常都归一化为脱敏的 `AiError`。
 */

const log = logger.scope('ai:deepseek')

/** 把领域消息转换为 SDK 消息（显式 switch 保证判别联合可赋值）。 */
function toSdkMessage(message: AiChatMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
      return { role: 'system', content: message.content }
    case 'assistant':
      return { role: 'assistant', content: message.content }
    default:
      return { role: 'user', content: message.content }
  }
}

/** usage 字段 snake_case → camelCase。 */
function toUsage(usage: {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}): AiUsage {
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens
  }
}

/** 拉取模型 ID 列表（`GET /models`，动态、不缓存；DeepSeek 不上报窗口）。 */
async function listModels(options: AiListModelsOptions = {}): Promise<AiModelInfo[]> {
  const { client, timeoutMs } = createAiClient('deepseek', { timeoutMs: options.timeoutMs })
  const request = createRequestSignal(options.signal, timeoutMs)

  try {
    const page = await client.models.list({
      signal: request.signal,
      timeout: timeoutMs
    })

    const ids: AiModelInfo[] = []
    const seen = new Set<string>()
    for (const model of page.data) {
      if (typeof model.id === 'string' && model.id && !seen.has(model.id)) {
        seen.add(model.id)
        ids.push({ id: model.id })
      }
    }
    return ids
  } catch (error) {
    const aiError = toAiError(error, request.timedOut())
    log.warn('拉取模型列表失败', { code: aiError.code, status: aiError.status })
    throw new AiFailure(aiError)
  } finally {
    request.dispose()
  }
}

/**
 * 流式对话。
 *
 * 事件顺序：若干 `delta` → 一条 `done`；失败时只发一条 `error`（含取消 / 超时）。
 */
async function streamChat(
  messages: AiChatMessage[],
  options: ResolvedAiChatOptions,
  onEvent: AiStreamListener
): Promise<void> {
  const { requestId } = options

  if (messages.length === 0) {
    onEvent({
      type: 'error',
      requestId,
      error: { code: 'invalid_request', message: 'Chat messages are empty' }
    })
    return
  }

  const model = (options.model ?? getProviderConnection('deepseek').model).trim()
  if (!model) {
    onEvent({
      type: 'error',
      requestId,
      error: { code: 'invalid_request', message: 'No model selected' }
    })
    return
  }

  let clientContext
  try {
    clientContext = createAiClient('deepseek', { timeoutMs: options.timeoutMs })
  } catch (error) {
    onEvent({ type: 'error', requestId, error: toAiError(error) })
    return
  }

  const { client, timeoutMs } = clientContext
  const request = createRequestSignal(options.signal, timeoutMs)
  let usage: AiUsage | undefined

  try {
    const stream = await client.chat.completions.create(
      {
        model,
        messages: messages.map(toSdkMessage),
        stream: true,
        stream_options: { include_usage: true },
        ...(typeof options.temperature === 'number' ? { temperature: options.temperature } : {}),
        ...(typeof options.maxTokens === 'number' ? { max_tokens: options.maxTokens } : {})
      },
      { signal: request.signal, timeout: timeoutMs }
    )

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        onEvent({ type: 'delta', requestId, delta })
      }
      if (chunk.usage) {
        usage = toUsage(chunk.usage)
      }
    }

    onEvent({ type: 'done', requestId, ...(usage ? { usage } : {}) })
  } catch (error) {
    const aiError = toAiError(error, request.timedOut())
    log.warn('流式对话失败', { code: aiError.code, status: aiError.status })
    onEvent({ type: 'error', requestId, error: aiError })
  } finally {
    request.dispose()
  }
}

/** DeepSeek 适配器实例。 */
export const deepseekProvider: AiProviderAdapter = {
  id: 'deepseek',
  listModels,
  streamChat
}
