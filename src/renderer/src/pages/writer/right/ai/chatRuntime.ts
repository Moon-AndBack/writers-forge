import { createLogger } from '@renderer/lib/log'
import type { AiApi, AiError, AiMessageStatus, AiUsage } from '../../../../../../preload/types/ai'
import type { AiComposeInput } from './functions'

/**
 * 章节右栏 AI · 会话运行期常量与纯工具（无 React）。
 *
 * 从 `useAiConversation.ts` 拆出（该文件主职责是 React 状态机）：这里只放
 * 请求 / 消息 id 生成、消息落库与兜底错误；prompt 模板与请求组装见 `functions.ts`。
 * 拆出后 hook 文件保持在 400 行以内（AGENTS §3）。
 */

/** 会话运行期日志（转发至主进程落盘；hook 侧复用同一 scope）。 */
export const chatLog = createLogger('aiChatRuntime')

/** IPC 不可用 / 启动抛错时的兜底错误（脱敏，不含正文）。 */
export const UNKNOWN_ERROR: AiError = { code: 'unknown', message: '' }

/** 对话消息（`useAiConversation` 的 UI 单元；由本模块统一声明以便纯逻辑复用）。 */
export interface AiConversationMessage {
  /** 本地临时 id（流式追加阶段用）或数据库 id。 */
  id: string
  role: 'user' | 'assistant'
  content: string
  /** 是否正在流式输出。 */
  streaming?: boolean
  /** 错误消息（assistant 气泡内的错误提示）。 */
  error?: AiError
  /**
   * 上游报错中断（来自库内 `status = 'interrupted'`）：正文只是半截。
   * 由落库状态还原，气泡据此显示结构化标记，且禁止回插正文。
   */
  interrupted?: boolean
}

/** `useAiConversation` 的对外状态与动作。 */
export interface AiConversationState {
  messages: AiConversationMessage[]
  /** 是否正在生成（有在途请求）。 */
  generating: boolean
  /** 是否正在读取会话历史（切换会话时短暂为 true，期间禁用发送）。 */
  hydrating: boolean
  /** 发送一次请求（所有请求都进对话历史并落库）。 */
  send: (compose: AiComposeInput) => void
  /** 中止当前请求。 */
  abort: () => void
}

/** 在途请求（流式事件的归位凭据；事件处理只认 requestId）。 */
export interface ActiveRequest {
  requestId: string
  /** 本次回复的本地消息 id（delta 追加 / done 定稿的目标）。 */
  assistantId: string
  /** 已累计的完整回复（done / 中止 / 出错时落库）。 */
  content: string
  /** 发起时快照的会话 id（落库时按它，不受切章影响）。 */
  sessionId: number | null
  /** 是否已落库（done / 停止 / 出错可能先后触达，靠它保证只写一次）。 */
  persisted?: boolean
}

/** 本地 id 序号（randomUUID 不可用时兜底）。 */
let localIdSeq = 0

/** 生成请求 id：主进程按它把流式事件归位到本次请求。 */
export function createRequestId(): string {
  const cryptoObj = globalThis.crypto
  if (typeof cryptoObj !== 'undefined' && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID()
  }
  localIdSeq += 1
  return `req-${Date.now().toString(36)}-${localIdSeq}`
}

/** 生成渲染层临时 id（用户消息 / 助手占位；与数据库 id 前缀区分）。 */
export function createLocalId(prefix: string): string {
  localIdSeq += 1
  return `local-${prefix}-${localIdSeq}`
}

/**
 * 追加消息落库（静默失败）。
 *
 * 用户消息在发送时写、助手回复在 `done` / 用户停止 / 上游报错时写；
 * `status` 缺省为 `done`，只有上游报错中断写 `interrupted`（见 `persistAssistantPartial`）。
 * 内容一律按原样落库，中断说明属于界面文案，**不进正文**。
 */
export async function appendMessage(
  sessionId: number,
  role: 'user' | 'assistant',
  content: string,
  options?: { usage?: AiUsage; status?: AiMessageStatus }
): Promise<void> {
  const api = window.api?.ai
  if (!api) return
  try {
    await api.messages.append({
      sessionId,
      role,
      content,
      ...(options?.status !== undefined ? { status: options.status } : {}),
      ...(options?.usage !== undefined ? { usageJson: JSON.stringify(options.usage) } : {})
    })
  } catch (error) {
    chatLog.warn('AI 消息落库失败', error)
  }
}

/**
 * 落库「未正常收尾的半截回复」。
 *
 * 用户点「停止」、切换会话 / 章节、关闭或卸载面板时，流式内容已生成的部分不再
 * 静默丢弃；上游报错（`handleError`）也走这里，只是状态记为 `interrupted`，
 * 让重新载入后的消息仍看得出「这条回复没走完」（标记由气泡按状态渲染，不写进正文）。
 * 有会话归属且正文非空才写。
 *
 * `persisted` 标记保证同一条回复只写一次：例如用户先点停止、随后迟到的事件 / 启动
 * 异常又走到失败分支时，不会重复落库。
 */
export function persistAssistantPartial(
  request: ActiveRequest,
  options?: { usage?: AiUsage; status?: AiMessageStatus }
): void {
  if (request.persisted === true) return
  if (request.sessionId === null || request.content.trim() === '') return
  request.persisted = true
  void appendMessage(request.sessionId, 'assistant', request.content, {
    ...(options?.usage !== undefined ? { usage: options.usage } : {}),
    ...(options?.status !== undefined ? { status: options.status } : {})
  })
}

/**
 * 载入指定会话的历史消息（`system` 行已剔除）。
 *
 * 会话选择由 `useAiSessions` 负责（默认仍取该章最近一条）；本函数只按 id 读取，
 * 返回 null 表示已被取消（切会话 / 切章 / 卸载）。
 */
export async function loadSessionMessages(input: {
  api: AiApi
  sessionId: number
  isCancelled: () => boolean
}): Promise<AiConversationMessage[] | null> {
  const { api, sessionId, isCancelled } = input
  const rows = await api.messages.list(sessionId)
  if (isCancelled()) return null

  return rows
    .filter((row) => row.role !== 'system')
    .map((row) => ({
      id: String(row.id),
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: row.content,
      ...(row.status === 'interrupted' ? { interrupted: true } : {})
    }))
}
