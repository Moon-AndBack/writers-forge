import { createLogger } from '@renderer/lib/log'
import type {
  AiApi,
  AiChatRole,
  AiError,
  AiMessageStatus,
  AiUsage
} from '../../../../../../preload/types/ai'
import type { AiComposeInput } from './functions'
import { findSummary } from './contextSummary'
import type { CompactionMarker, SavedSummary } from './contextSummary'

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
  /**
   * 消息产生时所在的章（发送瞬间快照）；无章聊天 / 分隔行为 `undefined`。
   * 回插校验据此判断「是否来自当前章」（见 `panelUtils.canApplyMessage`）。
   */
  chapterId?: number | null
  /** 是否正在流式输出。 */
  streaming?: boolean
  /** 错误消息（assistant 气泡内的错误提示）。 */
  error?: AiError
  /**
   * 上游报错中断（来自库内 `status = 'interrupted'`）：正文只是半截。
   * 由落库状态还原，气泡据此显示结构化标记，且禁止回插正文。
   */
  interrupted?: boolean
  /**
   * 上下文压缩分隔行（不是气泡、不是消息）：`compacted` = 已把较早对话压成摘要，
   * `truncated` = 摘要不可用 / 后续超限，直接省略了较早对话。
   */
  divider?: CompactionMarker
}

/** 发送被拒的原因（超预算时给 UI 展示已用 / 窗口）。 */
export interface AiContextNotice {
  usedTokens: number
  limitTokens: number
}

/** `useAiConversation` 的对外状态与动作。 */
export interface AiConversationState {
  messages: AiConversationMessage[]
  /** 是否正在生成（有在途请求）。 */
  generating: boolean
  /** 是否正在为发送整理上下文（摘要 / 截断期间为 true）。 */
  compressing: boolean
  /** 是否正在读取会话历史（切换会话时短暂为 true，期间禁用发送）。 */
  hydrating: boolean
  /** 当前会话已存的上下文摘要（无则 null）。 */
  summary: SavedSummary | null
  /** 上次发送因超预算被拒绝的信息（下次发送时清空）。 */
  notice: AiContextNotice | null
  /** 发送一次请求；返回 false 表示被拒绝（调用方应恢复输入）。 */
  send: (compose: AiComposeInput) => Promise<boolean>
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
  /** 发起时所在的章（落库为消息的 `chapterId` 来源标记；无章聊天为 null）。 */
  chapterId: number | null
  /** 发送前对 `prepared.messages` 的 token 估算（校准分母；0 = 尚未计算，不参与校准）。 */
  estimatedPromptTokens: number
  /** 校准键 `provider/model`（发送前回填；空串 = 未知，不参与校准）。 */
  calibrationKey: string
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
 * 构造发送瞬间的乐观消息（user 展示气泡 + assistant 流式占位）。
 *
 * `chapterId` 是本次请求的章快照：消息随会话跨章保留，回插时据此判断来源章
 * （见 `panelUtils.canApplyMessage`）。
 */
export function createOptimisticMessages(input: {
  base: AiConversationMessage[]
  userText: string
  assistantId: string
  chapterId: number | null
}): AiConversationMessage[] {
  const { base, userText, assistantId, chapterId } = input
  return [
    ...base,
    ...(userText !== ''
      ? [{ id: createLocalId('user'), role: 'user' as const, content: userText, chapterId }]
      : []),
    { id: assistantId, role: 'assistant' as const, content: '', streaming: true, chapterId }
  ]
}

/**
 * 追加消息落库（静默失败）。
 *
 * 用户消息在发送时写、助手回复在 `done` / 用户停止 / 上游报错时写；
 * `status` 缺省为 `done`，只有上游报错中断写 `interrupted`（见 `persistAssistantPartial`）。
 * `chapterId` 记录消息产生时所在的章（无章聊天为 null），供回插校验。
 * 内容一律按原样落库，中断说明属于界面文案，**不进正文**。
 */
export async function appendMessage(
  sessionId: number,
  role: AiChatRole,
  content: string,
  options?: { usage?: AiUsage; status?: AiMessageStatus; chapterId?: number | null }
): Promise<void> {
  const api = window.api?.ai
  if (!api) return
  try {
    await api.messages.append({
      sessionId,
      chapterId: options?.chapterId ?? null,
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
    chapterId: request.chapterId,
    ...(options?.usage !== undefined ? { usage: options.usage } : {}),
    ...(options?.status !== undefined ? { status: options.status } : {})
  })
}

/**
 * 载入指定会话的历史消息。
 *
 * `system` 行不进入消息列表，而是作为**上下文摘要**单独返回：取最后一条
 * `role = 'system'` 行（摘要由 `appendMessage(sessionId, 'system', ...)` 写入，
 * 带 `covered` 隐藏标记）。其余 system 行一律忽略，避免脏数据渲染成气泡。
 *
 * 会话选择由 `useAiSessions` 负责（默认取该书最近一条）；本函数只按 id 读取，
 * 返回 null 表示已被取消（切会话 / 切书 / 卸载）。
 */
export async function loadSessionMessages(input: {
  api: AiApi
  sessionId: number
  isCancelled: () => boolean
}): Promise<{ messages: AiConversationMessage[]; summary: SavedSummary | null } | null> {
  const { api, sessionId, isCancelled } = input
  const rows = await api.messages.list(sessionId)
  if (isCancelled()) return null

  const summary = findSummary(rows)
  const messages: AiConversationMessage[] = rows
    .filter((row) => row.role !== 'system')
    .map((row) => ({
      id: String(row.id),
      role: row.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: row.content,
      chapterId: row.chapterId,
      ...(row.status === 'interrupted' ? { interrupted: true } : {})
    }))

  // 重启 / 切回会话后仍标出压缩边界，避免用户误以为被覆盖的历史还会整段发给模型。
  if (summary !== null && summary.covered > 0) {
    const rounds = messages
      .slice(0, summary.covered)
      .filter((message) => message.role === 'user').length
    return {
      messages: insertCompactionDivider(messages, summary.covered, {
        kind: 'compacted',
        rounds
      }),
      summary
    }
  }

  return { messages, summary }
}

/**
 * 把压缩分隔行插到「已覆盖消息」与「保留的 recent」之间。
 *
 * `covered` 是非 system 消息的条数（分隔行本身不计数）；找不到边界时追加到末尾。
 */
export function insertCompactionDivider(
  messages: AiConversationMessage[],
  covered: number,
  marker: CompactionMarker
): AiConversationMessage[] {
  let seen = 0
  let index = messages.length
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]
    if (!message || message.divider !== undefined) continue
    if (seen === covered) {
      index = i
      break
    }
    seen += 1
  }

  const divider: AiConversationMessage = {
    id: createLocalId('divider'),
    role: 'assistant',
    content: '',
    divider: marker
  }
  return [...messages.slice(0, index), divider, ...messages.slice(index)]
}
