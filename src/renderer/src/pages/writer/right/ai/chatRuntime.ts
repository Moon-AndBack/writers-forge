import { createLogger } from '@renderer/lib/log'
import type { AiApi, AiError, AiUsage } from '../../../../../../preload/types/ai'
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
  /** 已累计的完整回复（done 时落库）。 */
  content: string
  /** 发起时快照的会话 id（done 时按它落库，不受切章影响）。 */
  sessionId: number | null
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
 * 用户消息在发送时写、助手完整回复在 `done` 后写；用户中止 / 切会话 / 切章时，
 * 已生成的半截回复也在此落库（见 `persistAssistantPartial`），写入失败只记日志。
 */
export async function appendMessage(
  sessionId: number,
  role: 'user' | 'assistant',
  content: string,
  usage?: AiUsage
): Promise<void> {
  const api = window.api?.ai
  if (!api) return
  try {
    await api.messages.append({
      sessionId,
      role,
      content,
      ...(usage !== undefined ? { usageJson: JSON.stringify(usage) } : {})
    })
  } catch (error) {
    chatLog.warn('AI 消息落库失败', error)
  }
}

/**
 * 落库「中止时的半截回复」。
 *
 * 用户点「停止」、切换会话 / 章节、关闭或卸载面板时，流式内容已生成的部分不再
 * 静默丢弃：有会话归属且正文非空就写一条 assistant 消息（与 `done` 落库同口径）。
 */
export function persistAssistantPartial(request: ActiveRequest): void {
  if (request.sessionId === null || request.content.trim() === '') return
  void appendMessage(request.sessionId, 'assistant', request.content)
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
      content: row.content
    }))
}
