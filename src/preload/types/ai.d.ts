/**
 * preload 类型域 · **AI**（`ai:*` 通道 + 流式事件订阅）。
 *
 * 属 `src/preload/types/` 按域拆分产物。**单一真源**：类型一律经 `import type`
 * 从主进程能力层（`main/ai`）与数据层（`main/database/aiChat`）取用，不逐字镜像
 * （理由见 `database.d.ts` 文件头：`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * 安全约定：本域**不存在**任何返回密钥明文的签名——配置只有 `AiConfigView`（掩码视图），
 * 错误只有脱敏 `AiError`。
 */

import type {
  AiChatMessage as MainAiChatMessage,
  AiConfigPatch,
  AiConfigUpdateResult,
  AiConfigView,
  AiError,
  AiModelsListMode,
  AiProviderId,
  AiStreamEvent,
  AiUsage
} from '../../main/ai/types'
import type {
  AiChatMessageRow,
  AiChatRole,
  AiChatSessionRow,
  AiMessageStatus,
  AppendAiMessageInput,
  CreateAiSessionInput
} from '../../main/database/aiChat'

export type {
  AiConfigPatch,
  AiConfigUpdateResult,
  AiConfigView,
  AiError,
  AiModelsListMode,
  AiProviderId,
  AiStreamEvent,
  AiUsage,
  AiChatMessageRow,
  AiChatRole,
  AiChatSessionRow,
  AiMessageStatus,
  AppendAiMessageInput,
  CreateAiSessionInput
}

/** 对话消息（与 `main/ai` 的 `AiChatMessage` 同构）。 */
export type AiChatMessage = MainAiChatMessage

/** 模型列表结果：失败以 `ok=false` + 脱敏错误表达，不抛异常。 */
export interface AiModelsResult {
  ok: boolean
  /**
   * 模型 ID 列表。
   *
   * `mode: 'cache'` 未命中时省略；`refresh` 失败但本地有旧缓存时仍回传旧列表。
   */
  models?: string[]
  error?: AiError
  /** 结果来源：本地缓存 / 本次联网。 */
  source?: 'cache' | 'network'
  /** 该列表的拉取时刻（毫秒时间戳）。 */
  fetchedAt?: number
  /** 缓存已超过有效期（12 小时）：内容可用，调用方应后台刷新。 */
  stale?: boolean
}

/** 连通性测试结果（仅调模型列表计时，不发送任何用户正文）。 */
export interface AiTestResult {
  ok: boolean
  latencyMs: number
  error?: AiError
}

/** 流式对话启动入参。 */
export interface AiChatStartInput {
  /** 本次请求标识（渲染层生成，全生命周期归位流式事件）。 */
  requestId: string
  messages: AiChatMessage[]
  /**
   * 对话会话标识：opencode Go 要求每个会话发送稳定的 `x-opencode-session` 头。
   * 调用方应传 `ai_chat_sessions.id`（同一会话恒定）；缺省时由主进程生成临时值。
   * DeepSeek 不使用该字段。
   */
  sessionId?: string
  /** 缺省回退到当前配置的服务商。 */
  provider?: AiProviderId
  /** 缺省回退到当前配置的模型。 */
  model?: string
  temperature?: number
  maxTokens?: number
}

/** 流式订阅回调；返回值即退订函数。 */
export type AiStreamUnsubscribe = () => void

/**
 * AI 域 preload 暴露面（挂载于 `window.api.ai`）。
 *
 * 通道对应关系见 `main/ipc/ai.ts` 的 `registerAiIpc` 注释块，两侧须同步。
 */
export interface AiApi {
  /** 配置：只读非敏感视图 + 写补丁。 */
  config: {
    get: () => Promise<AiConfigView>
    /** 入参非法 / 写入失败时 reject（不返回半成品配置）；密钥被拒原因见 `apiKeyError`。 */
    set: (patch: AiConfigPatch) => Promise<AiConfigUpdateResult>
  }
  /** 模型列表：先读缓存（缺省），或强制联网刷新。失败返回 `ok=false` + 脱敏错误。 */
  models: {
    list: (provider: AiProviderId, mode?: AiModelsListMode) => Promise<AiModelsResult>
  }
  /** 连通性测试（仅模型列表往返计时）。 */
  test: (provider: AiProviderId) => Promise<AiTestResult>
  /** 流式对话：start 立即返回，内容全部走 `onStream`。 */
  chat: {
    start: (input: AiChatStartInput) => Promise<void>
    /** 中止指定请求；无在途请求返回 false。 */
    abort: (requestId: string) => Promise<boolean>
    /** 订阅流式事件（delta / done / error），返回退订函数（组件卸载时必调）。 */
    onStream: (callback: (event: AiStreamEvent) => void) => AiStreamUnsubscribe
  }
  /** 会话：按「书 + 章」归属。 */
  sessions: {
    list: (bookId: string, chapterId: number) => Promise<AiChatSessionRow[]>
    create: (input: CreateAiSessionInput) => Promise<AiChatSessionRow | null>
    delete: (id: number) => Promise<boolean>
    rename: (id: number, title: string) => Promise<boolean>
  }
  /** 消息：按会话按写入顺序。 */
  messages: {
    list: (sessionId: number) => Promise<AiChatMessageRow[]>
    append: (input: AppendAiMessageInput) => Promise<AiChatMessageRow | null>
  }
}
