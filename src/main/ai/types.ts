/**
 * AI 域公共类型。
 *
 * 约定：
 * - 渲染层只能拿到非敏感配置（`AiConfigView`）与流式事件（`AiStreamEvent`）；
 * - 密钥明文仅在主进程内部使用（`getApiKey`），不得进入 IPC 载荷、日志或错误对象；
 * - 本文件不依赖 `electron`，便于后续被 preload 的类型声明复用。
 */

/** 服务商标识。 */
export type AiProviderId = 'deepseek' | 'opencode'

/** 运行时判定服务商标识（IPC 入参校验用）。 */
export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === 'deepseek' || value === 'opencode'
}

/** 对话消息（与 OpenAI Chat Completions 对齐）。 */
export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 归一化错误码。
 *
 * 细分说明（同一 HTTP 状态含义不同，必须分开，否则 UI 给出误导性指引）：
 * - `auth` 为历史粗粒度值（保留兼容），通用映射不再产生，新代码用下面的细分值；
 * - `plan_restricted`：opencode 档位 / 套餐限制专用（换模型或升级档位，而非查密钥）；
 * - `forbidden`：通用 403 权限 / 地区 / 账号限制（换模型或检查账号权限）；
 * - `insufficient_quota`：402 账户余额 / 配额不足（充值后重试，等待无用）；
 * - `auth_missing`：401 未配置凭据（去填写 Key）；
 * - `auth_invalid`：401 凭据无效 / 过期（去重新填写 Key）。
 */
export type AiErrorCode =
  | 'network'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'invalid_request'
  | 'upstream'
  | 'aborted'
  | 'unknown'
  | 'plan_restricted'
  | 'session_missing'
  | 'auth_missing'
  | 'auth_invalid'
  | 'forbidden'
  | 'insufficient_quota'

/** 结构化错误（脱敏，不含上游原始响应体）。 */
export interface AiError {
  /** 归一化错误码。 */
  code: AiErrorCode
  /** 上游 HTTP 状态（无则省略）。 */
  status?: number
  /** 仅供日志与诊断的英文技术描述；UI 禁止渲染（界面文案一律按 code 走 i18n）。 */
  message: string
}

/** Token 用量。 */
export interface AiUsage {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

/** 流式事件（主进程 → 渲染层推送的载荷）。 */
export type AiStreamEvent =
  | { type: 'delta'; requestId: string; delta: string }
  | { type: 'done'; requestId: string; usage?: AiUsage }
  | { type: 'error'; requestId: string; error: AiError }

/** 流式事件回调。 */
export type AiStreamListener = (event: AiStreamEvent) => void

/** 只读配置视图（仅非敏感信息）。 */
export interface AiConfigView {
  provider: AiProviderId
  baseUrl: string
  model: string
  /**
   * 是否已存密钥（settings 中存在密文即 true）。
   *
   * 注意：当前环境不可解密时 `hasKey` 仍为 true，但 `keyMasked` 为空串，
   * 调用方应结合 `encryptionAvailable` 判断是否可用。
   */
  hasKey: boolean
  /** 掩码（如 `sk-****abcd`），无密钥或不可解密时为空串。 */
  keyMasked: string
  /** 当前环境是否支持加密存储。 */
  encryptionAvailable: boolean
}

/** 配置写入补丁。 */
export interface AiConfigPatch {
  provider?: AiProviderId
  baseUrl?: string
  model?: string
  /** 明文密钥；传空串表示清除已存密钥。 */
  apiKey?: string
}

/**
 * 密钥写入失败原因。
 *
 * 说明：`unsupported_provider` 为历史值（旧版拒绝为 opencode 保存密钥），
 * 当前所有服务商都走同一加密流程，**不会再产生**；保留仅为兼容旧 IPC 载荷。
 */
export type AiKeyWriteError = 'encryption_unavailable' | 'unsupported_provider'

/** 配置写入结果。 */
export interface AiConfigUpdateResult {
  /** 写入后的最新配置视图。 */
  config: AiConfigView
  /** 本次是否成功把密钥写入 settings。 */
  apiKeyStored: boolean
  /** 密钥被拒绝保存的原因（成功或未传 apiKey 时省略）。 */
  apiKeyError?: AiKeyWriteError
}

/** 模型列表查询参数。 */
export interface AiListModelsOptions {
  /** 覆盖默认超时（毫秒）。 */
  timeoutMs?: number
  /** 外部取消信号。 */
  signal?: AbortSignal
}

/** 对话参数（调用方传入；`requestId` 缺省时由聚合层生成）。 */
export interface AiChatOptions {
  /** 本次请求标识，用于把流式事件归位到具体请求。 */
  requestId?: string
  /** 覆盖配置中的模型 ID；空则回退到 settings 中的模型。 */
  model?: string
  temperature?: number
  maxTokens?: number
  /** 覆盖默认超时（毫秒）。 */
  timeoutMs?: number
  /** 外部取消信号。 */
  signal?: AbortSignal
  /**
   * 对话会话标识：opencode Go 要求每个会话发送稳定的 `x-opencode-session` 头，
   * 缺失会返回 400 MissingSessionID。DeepSeek 不使用。
   * 调用方应传 `ai_chat_sessions.id`（同一会话恒定），缺省时由适配器生成临时值。
   */
  sessionId?: string
}

/** 归一化后的对话参数（`requestId` 必有），供 provider 适配器使用。 */
export type ResolvedAiChatOptions = AiChatOptions & { requestId: string }

/** 服务商适配器接口。 */
export interface AiProviderAdapter {
  readonly id: AiProviderId
  /** 动态拉取模型 ID 列表；失败抛结构化错误。 */
  listModels(options?: AiListModelsOptions): Promise<string[]>
  /**
   * 流式对话。
   *
   * 实现约束：网络 / 上游异常应通过 `onEvent({ type: 'error' })` 上报后正常返回；
   * 聚合层同时兜底捕获抛出的异常，避免调用方悬挂。
   */
  streamChat(
    messages: AiChatMessage[],
    options: ResolvedAiChatOptions,
    onEvent: AiStreamListener
  ): Promise<void>
}
