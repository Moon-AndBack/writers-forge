import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import { APIError } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { getProviderConnection } from '../config'
import {
  AiFailure,
  aiErrorFromStatus,
  createAiClient,
  createRequestSignal,
  normalizeBaseUrl,
  resolveTimeout,
  toAiError
} from '../http'
import { logger } from '../../logger'
import type {
  AiChatMessage,
  AiError,
  AiListModelsOptions,
  AiProviderAdapter,
  AiStreamListener,
  AiUsage,
  ResolvedAiChatOptions
} from '../types'

/**
 * opencode Go 适配器（标准 OpenAI 兼容 HTTP API）。
 *
 * 端点形态（注意两套前缀并存）：
 * - 模型列表 `GET  {baseUrl}/v1/models`
 * - 对话     `POST {baseUrl}/openai/v1/chat/completions`
 *
 * 鉴权与协议约束：
 * - `Authorization: Bearer <token>`；
 * - 每个会话必须带稳定的 `x-opencode-session` 头，缺失返回 400 `MissingSessionID`；
 * - 必须自报 `User-Agent`（不参与前置校验，但官方文档明确要求不用通用 SDK 名）；
 * - 模型 ID 一律动态拉取，本文件不硬编码任何模型名。
 */

const log = logger.scope('ai:opencode')

/** 对话端点相对路径（拼在 baseUrl 之后）。 */
const CHAT_BASE_PATH = '/openai/v1'

/** 上游响应体仅用于关键字分诊，截断后不再外泄（不入日志、不进 `AiError`）。 */
const DETAIL_LIMIT = 2_000

/** 对外固定的分诊提示语（不含上游原文，避免泄漏响应体）。 */
const MISSING_SESSION_MESSAGE = '缺少会话标识（x-opencode-session），请重新打开对话后重试'
const NO_CREDENTIAL_MESSAGE = '尚未配置 OpenCode Go 凭据'
const INVALID_CREDENTIAL_MESSAGE = 'OpenCode Go 凭据无效或已过期，请重新填写'
const FREE_TIER_MESSAGE = 'OpenCode Go 拒绝该请求：所选模型可能不在当前档位可用范围内'

/** 请求头 `User-Agent`：自报产品名 + 运行时版本（不硬编码版本号）。 */
function buildUserAgent(): string {
  try {
    return `Writer's Forge/${app.getVersion()}`
  } catch {
    // 极端情况下（app 尚未初始化）退化为纯产品名，仍满足「不使用通用 SDK 名」的要求。
    return "Writer's Forge"
  }
}

/** 判别普通对象（解析上游 JSON 载荷用）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 提取 SDK 异常里的分诊关键字（含上游 error 载荷；仅内存内使用）。 */
function extractDetail(error: APIError): string {
  const parts = [error.message]
  if (error.error !== undefined) {
    try {
      parts.push(JSON.stringify(error.error))
    } catch {
      // 载荷不可序列化时忽略，仅保留 message。
    }
  }
  return parts.join(' ').slice(0, DETAIL_LIMIT)
}

/** 读取失败响应体的短片段（仅用于关键字分诊）。 */
async function readSnippet(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, DETAIL_LIMIT)
  } catch {
    return ''
  }
}

/**
 * 状态码 + 关键字 → 明确 `AiError`（无法细分时返回 `undefined`，由调用方回退通用映射）。
 *
 * 校验顺序（上游）：body → session → 凭据存在 → 凭据有效，
 * 因此 400 与 401 必须分开提示，不能一律让用户去查密钥。
 */
function mapStatusError(status: number, detail: string, hasKey: boolean): AiError | undefined {
  if (status === 400 && detail.includes('MissingSessionID')) {
    return { code: 'invalid_request', status, message: MISSING_SESSION_MESSAGE }
  }
  if (status === 401) {
    if (detail.includes('Invalid credential')) {
      return { code: 'auth', status, message: INVALID_CREDENTIAL_MESSAGE }
    }
    if (detail.includes('Go requires a credential') || !hasKey) {
      return { code: 'auth', status, message: NO_CREDENTIAL_MESSAGE }
    }
    return { code: 'auth', status, message: INVALID_CREDENTIAL_MESSAGE }
  }
  if (status === 403) {
    return { code: 'auth', status, message: FREE_TIER_MESSAGE }
  }
  return undefined
}

/** 解析 `{ data: [{ id }] }`，去重并保序。 */
function collectModelIds(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const item of payload.data) {
    if (!isRecord(item)) continue
    const id = item.id
    if (typeof id === 'string' && id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  return ids
}

/**
 * 拉取模型 ID 列表（`GET {baseUrl}/v1/models`，动态、不缓存）。
 *
 * 说明：**不走** SDK 的 `client.models.list()`——SDK 会拼成 `{baseURL}/models`，
 * 而 opencode 的模型列表在 `/v1/models`、对话在 `/openai/v1/...`，两套前缀不同，
 * 单一 baseURL 无法同时命中，故此处使用原生 `fetch`。
 */
async function listModels(options: AiListModelsOptions = {}): Promise<string[]> {
  const connection = getProviderConnection('opencode')
  const baseUrl = normalizeBaseUrl(connection.baseUrl)
  if (!baseUrl) {
    throw new AiFailure({ code: 'invalid_request', message: 'Base URL 不能为空' })
  }

  const timeoutMs = resolveTimeout(options.timeoutMs)
  const request = createRequestSignal(options.signal, timeoutMs)
  const apiKey = connection.apiKey

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': buildUserAgent()
    }
    // 实测：携带**无效** token 会让 200 变 401，故仅在已配置密钥时附带。
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`

    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers,
      signal: request.signal
    })

    if (!response.ok) {
      const detail = await readSnippet(response)
      const mapped = mapStatusError(response.status, detail, apiKey !== null)
      throw new AiFailure(mapped ?? aiErrorFromStatus(response.status))
    }

    return collectModelIds((await response.json()) as unknown)
  } catch (error) {
    const aiError =
      error instanceof AiFailure ? error.aiError : toAiError(error, request.timedOut())
    log.warn('拉取模型列表失败', { code: aiError.code, status: aiError.status })
    throw new AiFailure(aiError)
  } finally {
    request.dispose()
  }
}

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

/** SDK 异常 → 脱敏 `AiError`（先做 opencode 专有分诊，再回退通用映射）。 */
function toChatError(error: unknown, timedOut: boolean): AiError {
  if (!timedOut && error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined
    if (status !== undefined) {
      const mapped = mapStatusError(status, extractDetail(error), true)
      if (mapped) return mapped
    }
  }
  return toAiError(error, timedOut)
}

/**
 * 流式对话。
 *
 * 事件顺序：若干 `delta` → 一条 `done`；失败时只发一条 `error`（含取消 / 超时）。
 * `sessionId` 缺省时生成一次性 UUID（同一会话应由调用方传入稳定值）。
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
      error: { code: 'invalid_request', message: '对话消息不能为空' }
    })
    return
  }

  const connection = getProviderConnection('opencode')
  const model = (options.model ?? connection.model).trim()
  if (!model) {
    onEvent({
      type: 'error',
      requestId,
      error: { code: 'invalid_request', message: '尚未选择模型' }
    })
    return
  }

  const baseUrl = normalizeBaseUrl(connection.baseUrl)
  if (!baseUrl) {
    onEvent({
      type: 'error',
      requestId,
      error: { code: 'invalid_request', message: 'Base URL 不能为空' }
    })
    return
  }

  const sessionId = options.sessionId?.trim() || randomUUID()

  let clientContext
  try {
    clientContext = createAiClient('opencode', {
      baseUrl: `${baseUrl}${CHAT_BASE_PATH}`,
      timeoutMs: options.timeoutMs,
      headers: {
        'User-Agent': buildUserAgent(),
        'x-opencode-session': sessionId
      }
    })
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
    const aiError = toChatError(error, request.timedOut())
    log.warn('流式对话失败', { code: aiError.code, status: aiError.status })
    onEvent({ type: 'error', requestId, error: aiError })
  } finally {
    request.dispose()
  }
}

/** opencode Go 适配器实例。 */
export const opencodeProvider: AiProviderAdapter = {
  id: 'opencode',
  listModels,
  streamChat
}
