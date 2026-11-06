import type { AiChatMessage, AiError, AiProviderId } from '../../../../../../preload/types/ai'
import type { AiConversationMessage } from './chatRuntime'
import type { AiComposeMessage } from './functions'
import { COMPRESS_RATIO, TARGET_RATIO, estimateMessages, estimateTokens } from './contextBudget'

/**
 * 上下文摘要压缩（纯逻辑 + 一次非流式补全调用）。
 *
 * 约定：
 * - 摘要以 `role = 'system'` 的消息落库，**不新增表、不改原文**；
 * - 摘要行正文带一个隐藏标记 `<!--wf-summary covered=N-->`：`N` 表示
 *   该会话前 N 条非 system 消息已被摘要覆盖。标记只在读写时解析，
 *   **永远不会**随请求发给模型（发送前由 `buildCompactedMessages` 剥离）；
 * - 重启后按 `covered` 复用摘要，不会重复生成；
 * - 摘要请求走 `ai:chat:complete`（非流式、独立 requestId），与面板流式订阅隔离。
 */

/** 发送链路消息条数上限（与主进程 `MAX_MESSAGES` 对齐；压缩后必须守住）。 */
const MAX_OUTGOING_MESSAGES = 200

/** 摘要请求单条正文上限（主进程 `MAX_MESSAGE_CHARS` 为 10 万，这里留余量）。 */
const SUMMARY_CHUNK_CHARS = 80_000

/** 摘要输出上限：控制摘要本身占用的窗口。 */
const SUMMARY_MAX_TOKENS = 1_200

/** 首次压缩时给摘要预留的 token（避免摘要把 recent 挤爆）。 */
const SUMMARY_RESERVE_TOKENS = 1_200

/** 摘要行标记：`covered` 是已覆盖的非 system 消息条数。 */
const SUMMARY_MARKER = /^<!--wf-summary covered=(\d+)-->\n/

/** 已落库 / 内存中的摘要。 */
export interface SavedSummary {
  /** 数据库行 id；内存中新建且未回读时为 0。 */
  id: number
  /** 摘要正文（已剥离隐藏标记）。 */
  content: string
  /** 摘要覆盖了会话前多少条非 system 消息。 */
  covered: number
}

/** `findSummary` 的最小行形状（数据库消息行天然满足）。 */
export interface SummarySourceRow {
  id: number
  role: string
  content: string
}

/** 压缩分隔行（UI 可见，不进正文、不进模型）。 */
export interface CompactionMarker {
  kind: 'compacted' | 'truncated'
  /** 被压缩 / 省略的轮数（按 user 消息计）。 */
  rounds: number
}

/** 生成摘要行正文（隐藏标记 + 摘要）。 */
export function encodeSummaryRow(covered: number, text: string): string {
  return `<!--wf-summary covered=${covered}-->\n${text.trim()}`
}

/** 取该会话已存的摘要（最后一条 system 消息）。 */
export function findSummary(messages: readonly SummarySourceRow[]): SavedSummary | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index]
    if (!row || row.role !== 'system') continue
    const matched = SUMMARY_MARKER.exec(row.content)
    const parsed = matched ? Number(matched[1]) : 0
    return {
      id: row.id,
      content: matched ? row.content.slice(matched[0].length) : row.content,
      covered: Number.isFinite(parsed) && parsed > 0 ? parsed : 0
    }
  }
  return null
}

/** 把摘要并入第一条 system（不新增第二条 system，兼容只认首条的转接站）。 */
function mergeSummary(systemText: string, summaryText: string): string {
  const trimmed = summaryText.trim()
  if (trimmed === '') return systemText
  return `${systemText}\n\n【此前对话摘要】\n${trimmed}`
}

/**
 * 组装最终要发送的消息：合并摘要进 system + 保留 recent。
 *
 * `composed` 为 `composeMessages` 的 `[system, user]`；`recent` 是压缩后保留的
 * 历史消息（不含 system）。返回顺序固定为 `[system, ...recent, ...user]`。
 */
export function buildCompactedMessages(
  composed: readonly AiComposeMessage[],
  summaryText: string,
  recent: readonly { role: 'user' | 'assistant'; content: string }[]
): AiChatMessage[] {
  const head = composed[0]
  if (!head) return []
  const system: AiChatMessage = {
    role: 'system',
    content: mergeSummary(head.content, summaryText)
  }
  const history: AiChatMessage[] = recent.map((message) => ({
    role: message.role,
    content: message.content
  }))
  const tail: AiChatMessage[] = composed
    .slice(1)
    .map((message) => ({ role: message.role, content: message.content }))
  return [system, ...history, ...tail]
}

/** 单条消息格式化为摘要输入（角色用中文，便于模型区分）。 */
function formatConversation(messages: readonly AiChatMessage[]): string {
  return messages
    .map((message) => {
      const label =
        message.role === 'assistant' ? '助手' : message.role === 'user' ? '作者' : '说明'
      return `${label}：${message.content}`
    })
    .join('\n\n')
}

/**
 * 按字符预算切块：摘要输入是单条 user 消息（10 万字符上限），
 * 超长历史必须分段滚动摘要，否则整次摘要会因 `invalid_request` 失败。
 */
function chunkForSummary(messages: readonly AiChatMessage[]): AiChatMessage[][] {
  const chunks: AiChatMessage[][] = []
  let current: AiChatMessage[] = []
  let size = 0

  for (const message of messages) {
    const cost = message.content.length + 8
    if (cost > SUMMARY_CHUNK_CHARS) {
      if (current.length > 0) {
        chunks.push(current)
        current = []
        size = 0
      }
      chunks.push([{ role: message.role, content: message.content.slice(0, SUMMARY_CHUNK_CHARS) }])
      continue
    }
    if (size + cost > SUMMARY_CHUNK_CHARS && current.length > 0) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push({ role: message.role, content: message.content })
    size += cost
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

const SUMMARY_SYSTEM_PROMPT = [
  '你在为一部小说的写作助手维护「对话摘要」。把给出的对话压缩成一段可直接放进 system 提示的摘要，供后续对话继续使用。',
  '必须保留：人物名、地名、专有名词及人物关系；已确认的设定、世界观规则、时间线与文风 / 称谓约定；作者明确提出的要求、否决项与已达成结论；仍未解决的悬念、待办与伏笔。',
  '不要编造、不要评价、不要输出标题 / 列表 / 代码块 / 前言，只输出摘要正文，使用简体中文，控制在 800 字以内。'
].join('\n')

/** 发起一次补全（失败返回结构化错误，不抛）。 */
async function completeOnce(
  userContent: string,
  options: { provider: AiProviderId; model: string; signal?: AbortSignal }
): Promise<{ ok: true; text: string } | { ok: false; error: AiError }> {
  const api = window.api?.ai
  if (!api) return { ok: false, error: { code: 'unknown', message: '' } }

  try {
    const result = await api.chat.complete({
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
      ],
      provider: options.provider,
      ...(options.model.trim() !== '' ? { model: options.model.trim() } : {}),
      maxTokens: SUMMARY_MAX_TOKENS
    })
    if (!result.ok || result.text === undefined) {
      return { ok: false, error: result.error ?? { code: 'unknown', message: '' } }
    }
    return { ok: true, text: result.text }
  } catch {
    return { ok: false, error: { code: 'unknown', message: '' } }
  }
}

/**
 * 触发一次摘要：把 older 消息压成一段摘要文本。
 *
 * 输入过长时按约 8 万字符分段做「滚动摘要」（把已有摘要与新一段合并），
 * 每段都是一次独立补全；任一段失败即整体失败，由调用方退化为纯截断。
 */
export async function summarize(
  older: readonly AiChatMessage[],
  options: { provider: AiProviderId; model: string; signal?: AbortSignal }
): Promise<{ ok: true; text: string } | { ok: false; error: AiError }> {
  if (older.length === 0) {
    return { ok: false, error: { code: 'invalid_request', message: 'Nothing to summarize' } }
  }

  const chunks = chunkForSummary(older)
  let summaryText = ''

  for (let index = 0; index < chunks.length; index += 1) {
    if (options.signal?.aborted === true) {
      return { ok: false, error: { code: 'aborted', message: '' } }
    }
    const chunk = chunks[index] ?? []
    const body = formatConversation(chunk)
    const userContent =
      summaryText === ''
        ? `【对话记录】\n${body}`
        : `【已有摘要】\n${summaryText}\n\n【新增对话】\n${body}`

    const result = await completeOnce(userContent, options)
    if (!result.ok) return result
    summaryText = result.text.trim()
  }

  if (summaryText === '') {
    return { ok: false, error: { code: 'upstream', message: 'Empty summary' } }
  }
  return { ok: true, text: summaryText }
}

/** 从尾部按 token 预算回溯取消息（预算不够时宁可少取，不超限）。 */
function selectRecent<T extends { content: string }>(
  messages: readonly T[],
  budgetTokens: number,
  maxCount: number
): T[] {
  const selected: T[] = []
  let used = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (selected.length >= maxCount) break
    const message = messages[index]
    if (!message) break
    const cost = 4 + estimateTokens(message.content)
    if (used + cost > budgetTokens) break
    selected.unshift(message)
    used += cost
  }
  return selected
}

/**
 * 兜底裁剪：条数超 200 或 token 超窗口时，从最早的历史消息开始丢，
 * 始终保留 system 与本轮 user。
 */
function fitMessages(messages: AiChatMessage[], limitTokens: number): AiChatMessage[] {
  let next = messages
  while (next.length > MAX_OUTGOING_MESSAGES) {
    next = [next[0] as AiChatMessage, ...next.slice(2)]
  }
  while (estimateMessages(next) > limitTokens && next.length > 2) {
    next = [next[0] as AiChatMessage, ...next.slice(2)]
  }
  return next
}

/** 压缩结果。 */
export type CompactResult =
  | {
      ok: true
      messages: AiChatMessage[]
      summary: SavedSummary | null
      divider: CompactionMarker | null
    }
  | { ok: false; usedTokens: number; limitTokens: number }

export interface PrepareOutgoingInput {
  /** `[system, user]`。 */
  composed: readonly AiComposeMessage[]
  /** 当前会话全部展示消息（user / assistant，不含分隔行）。 */
  history: readonly AiConversationMessage[]
  /** 已存摘要（无则 null）。 */
  summary: SavedSummary | null
  limitTokens: number
  provider: AiProviderId
  model: string
  /**
   * 是否允许生成新摘要（设置页「启用自动压缩」，缺省 true）。
   *
   * 关闭时不发摘要补全：达到 80% 直接按 50% 目标截断（复用已存摘要，免费），
   * 超预算仍拒绝——不阻断用户，只是不再额外花一次请求。
   */
  compress?: boolean
  signal?: AbortSignal
  /** 摘要生成成功后落库；返回 null 表示未能落库（内存摘要仍可用于本次发送）。 */
  persistSummary: (covered: number, text: string) => Promise<SavedSummary | null>
}

/** 统计一段消息里 user 的条数（「轮」的口径）。 */
function countRounds(messages: readonly { role: string }[]): number {
  return messages.filter((message) => message.role === 'user').length
}

/**
 * 生成最终发送消息（含摘要压缩与超预算判定）。
 *
 * 判定链：
 * 1. system + 本轮 user 本身超窗口 → 失败（携带正文超预算即命中此条，不截断正文）；
 * 2. 总占用 < 80% → 原样发送；
 * 3. 关闭自动压缩（`compress === false`）→ 复用已存摘要 + 纯截断，不发摘要请求；
 * 4. 已有摘要 → 复用，按 50% 目标从尾部回溯保留 recent（不重复摘要）；
 * 5. 无摘要 → 先保留 recent，把 older 摘要成 system 行；失败则退化为纯截断；
 * 6. 最终条数 ≤ 200 且 ≤ 窗口，否则失败。
 */
export async function prepareOutgoingMessages(input: PrepareOutgoingInput): Promise<CompactResult> {
  const { composed, history, limitTokens, summary, provider, model, signal } = input
  const fixedMessages = [composed[0], ...composed.slice(1)].filter(
    (message): message is AiComposeMessage => message !== undefined
  )
  const fixedTokens = estimateMessages(fixedMessages)
  if (fixedTokens > limitTokens) {
    return { ok: false, usedTokens: fixedTokens, limitTokens }
  }

  const covered = summary ? Math.min(summary.covered, history.length) : 0
  const uncovered = history.slice(covered)
  const assemble = (text: string, recent: readonly AiConversationMessage[]): AiChatMessage[] =>
    buildCompactedMessages(composed, text, recent)

  /** 统一收尾：兜底裁剪 → 校验条数与窗口 → 计算分隔行。 */
  const finish = (
    candidate: AiChatMessage[],
    nextSummary: SavedSummary | null,
    kind: CompactionMarker['kind']
  ): CompactResult => {
    const messages = fitMessages(candidate, limitTokens)
    const usedTokens = estimateMessages(messages)
    if (messages.length > MAX_OUTGOING_MESSAGES || usedTokens > limitTokens) {
      return { ok: false, usedTokens, limitTokens }
    }
    // 最终保留的 recent 条数 = 总条数 - system - 本轮 user。
    const keptRecent = Math.max(0, messages.length - 2)
    const dropped = Math.max(0, uncovered.length - keptRecent)
    const rounds = countRounds(uncovered.slice(0, dropped))
    return {
      ok: true,
      messages,
      summary: nextSummary,
      divider: dropped > 0 && rounds > 0 ? { kind, rounds } : null
    }
  }

  /* ① 未达 80%：原样发送。 */
  const full = assemble(summary?.content ?? '', uncovered)
  if (estimateMessages(full) <= limitTokens * COMPRESS_RATIO) {
    return finish(full, summary, 'truncated')
  }

  /* ② 关闭自动压缩：不复用摘要请求，直接按目标比例纯截断（已存摘要仍免费复用）。 */
  if (input.compress === false) {
    const summaryCost = summary ? 4 + estimateTokens(summary.content) : 0
    const budget = Math.max(0, limitTokens * TARGET_RATIO - fixedTokens - summaryCost)
    const recent = selectRecent(uncovered, budget, MAX_OUTGOING_MESSAGES - 2)
    return finish(assemble(summary?.content ?? '', recent), summary, 'truncated')
  }

  /* ③ 已有摘要：复用，不重复摘要；只按目标比例裁 recent。 */
  if (summary) {
    const summaryCost = 4 + estimateTokens(summary.content)
    const budget = Math.max(0, limitTokens * TARGET_RATIO - fixedTokens - summaryCost)
    const recent = selectRecent(uncovered, budget, MAX_OUTGOING_MESSAGES - 2)
    return finish(assemble(summary.content, recent), summary, 'truncated')
  }

  /* ④ 首次压缩：预留摘要空间，保留 recent，把 older 压成摘要。 */
  const reserve = Math.min(SUMMARY_RESERVE_TOKENS, Math.floor(limitTokens * 0.15))
  const budget = Math.max(0, limitTokens * TARGET_RATIO - fixedTokens - reserve)
  const recent = selectRecent(uncovered, budget, MAX_OUTGOING_MESSAGES - 2)
  const older = uncovered.slice(0, uncovered.length - recent.length)

  if (older.length === 0) {
    // 没有可压缩的历史（仅本轮 system + user 偏大）：交给收尾逻辑判定。
    return finish(assemble('', []), null, 'truncated')
  }

  const summaryResult = await summarize(
    older.map((message): AiChatMessage => ({ role: message.role, content: message.content })),
    { provider, model, ...(signal !== undefined ? { signal } : {}) }
  )

  if (!summaryResult.ok) {
    // 摘要失败不阻断发送：退化为纯截断（按 50% 目标保留 recent）。
    const fallbackBudget = Math.max(0, limitTokens * TARGET_RATIO - fixedTokens)
    const fallbackRecent = selectRecent(uncovered, fallbackBudget, MAX_OUTGOING_MESSAGES - 2)
    return finish(assemble('', fallbackRecent), null, 'truncated')
  }

  const nextSummary: SavedSummary = (await input.persistSummary(
    covered + older.length,
    summaryResult.text
  )) ?? {
    id: 0,
    content: summaryResult.text,
    covered: covered + older.length
  }

  // 摘要实际长度可能与预留不同：按真实摘要重算 recent。
  const summaryCost = 4 + estimateTokens(nextSummary.content)
  const actualBudget = Math.max(0, limitTokens * TARGET_RATIO - fixedTokens - summaryCost)
  const finalRecent = selectRecent(uncovered, actualBudget, MAX_OUTGOING_MESSAGES - 2)
  return finish(assemble(nextSummary.content, finalRecent), nextSummary, 'compacted')
}
