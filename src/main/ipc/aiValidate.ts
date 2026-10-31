import { isAiProviderId } from '../ai'
import type { AiChatMessage, AiConfigPatch, AiProviderId } from '../ai/types'

/**
 * AI 域 IPC 入参校验（自 `ai.ts` 迁出的纯函数集合，零 electron 依赖）。
 *
 * 只做「未知入参 → 强类型或 null」的判定，不适配、不落库、不发事件。
 * 校验不过一律返回 null，由调用方决定抛错还是回兜底值。
 */

/** 单次对话消息条数 / 单条正文长度上限（字符数）。 */
const MAX_MESSAGES = 200

/** 单条消息正文上限（`ai:messages:append` 复用）。 */
export const MAX_MESSAGE_CHARS = 100_000

/** `requestId` / `sessionId` 允许字符集与长度上限（兼容 UUID 与数字 id）。 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/
const MAX_REQUEST_ID_CHARS = 128

/** 书 id / 模型 id / 会话标题等短字符串上限。 */
export const MAX_ID_CHARS = 200

/** Base URL、API Key、消息 `usageJson` 各自的长度上限。 */
const MAX_BASE_URL_CHARS = 2048
const MAX_API_KEY_CHARS = 8192
export const MAX_USAGE_JSON_CHARS = 4096

/** 通用判定：普通对象（排除数组与 null）。 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 字符串且长度不超过上限。 */
export function isTextWithin(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.length <= maxChars
}

/** 正整数（会话 id / 章 id / maxTokens）。 */
export function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 解析不透明标识（`requestId` / `sessionId`）：非空 + 允许字符集 + 长度上限。 */
export function readOpaqueId(value: unknown): string | null {
  if (!isTextWithin(value, MAX_REQUEST_ID_CHARS) || value.length === 0) return null
  return REQUEST_ID_PATTERN.test(value) ? value : null
}

/** 解析 `{ provider }` 入参（`ai:models:list` / `ai:test` 共用）。 */
export function readProviderInput(input: unknown): AiProviderId | null {
  if (!isRecord(input)) return null
  return isAiProviderId(input.provider) ? input.provider : null
}

/** 解析消息数组（逐条校验角色与正文长度）。 */
function readMessages(value: unknown): AiChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) return null
  const messages: AiChatMessage[] = []
  for (const item of value) {
    if (!isRecord(item)) return null
    const role = item.role
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
    if (!isTextWithin(item.content, MAX_MESSAGE_CHARS)) return null
    messages.push({ role, content: item.content })
  }
  return messages
}

/** 解析配置补丁；任一字段类型非法返回 null（整体拒绝，不做部分写入）。 */
export function readConfigPatch(input: unknown): AiConfigPatch | null {
  if (!isRecord(input)) return null
  const patch: AiConfigPatch = {}

  if (input.provider !== undefined) {
    if (!isAiProviderId(input.provider)) return null
    patch.provider = input.provider
  }
  if (input.baseUrl !== undefined) {
    if (!isTextWithin(input.baseUrl, MAX_BASE_URL_CHARS)) return null
    patch.baseUrl = input.baseUrl
  }
  if (input.model !== undefined) {
    if (!isTextWithin(input.model, MAX_ID_CHARS)) return null
    patch.model = input.model
  }
  if (input.apiKey !== undefined) {
    if (!isTextWithin(input.apiKey, MAX_API_KEY_CHARS)) return null
    patch.apiKey = input.apiKey
  }

  return patch
}

/** `ai:chat:start` 解析后的入参。 */
export interface ChatStartInput {
  requestId: string
  messages: AiChatMessage[]
  /** 对话会话标识（opencode 稳定会话头）；缺省由适配器生成临时值。 */
  sessionId?: string
  provider?: AiProviderId
  model?: string
  temperature?: number
  maxTokens?: number
}

/** 解析流式对话入参；缺省字段保持 undefined（由能力层回退到配置）。 */
export function readChatStartInput(input: unknown): ChatStartInput | null {
  if (!isRecord(input)) return null
  const requestId = readOpaqueId(input.requestId)
  if (!requestId) return null
  const messages = readMessages(input.messages)
  if (!messages) return null

  const parsed: ChatStartInput = { requestId, messages }

  if (input.sessionId !== undefined) {
    const sessionId = readOpaqueId(input.sessionId)
    if (!sessionId) return null
    parsed.sessionId = sessionId
  }
  if (input.provider !== undefined) {
    if (!isAiProviderId(input.provider)) return null
    parsed.provider = input.provider
  }
  if (input.model !== undefined) {
    if (!isTextWithin(input.model, MAX_ID_CHARS)) return null
    parsed.model = input.model
  }
  if (input.temperature !== undefined) {
    const temperature = input.temperature
    if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return null
    if (temperature < 0 || temperature > 2) return null
    parsed.temperature = temperature
  }
  if (input.maxTokens !== undefined) {
    if (!isPositiveInt(input.maxTokens) || input.maxTokens > 1_000_000) return null
    parsed.maxTokens = input.maxTokens
  }

  return parsed
}
