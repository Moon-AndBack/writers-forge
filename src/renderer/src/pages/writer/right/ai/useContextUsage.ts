import { useEffect, useMemo, useState } from 'react'
import type { AiChatMessage, ResolvedLimit } from '../../../../../../preload/types/ai'
import {
  DEFAULT_CONTEXT_WINDOW,
  estimateMessages,
  estimateTokens,
  type ContextUsage
} from './contextBudget'

/**
 * AI 面板上下文占用（估算）。
 *
 * - 窗口值来自主进程目录（`ai:catalog:limit`）：**按模型缓存**，模型不变就永不重复 IPC；
 * - 已用 = 历史消息（含每条开销）+ 输入框草稿 + 携带的正文（全文 / 选中文本）；
 * - `active === false`（面板未激活）时不发 IPC、不重算，直接返回 null；
 * - 本 hook 只读估算，**不参与任何发送 / 拒绝 / 压缩决策**（第 3 步才接触发逻辑）。
 */

/** 窗口缓存：模型 ID（trim 后）→ 主进程解析结果；跨面板开关与组件重挂复用。 */
const limitCache = new Map<string, ResolvedLimit>()

/** IPC 不可用 / 解析失败时的兜底：按 32K 默认窗口估算（UI 标注「未知模型」）。 */
const FALLBACK_LIMIT: ResolvedLimit = {
  tokens: DEFAULT_CONTEXT_WINDOW,
  source: 'default',
  confidence: 'default',
  matchedId: null
}

export interface UseContextUsageOptions {
  model: string
  /** 当前会话的消息（不含 system）。 */
  messages: readonly AiChatMessage[]
  /** 当前输入框内容（计入「预估下一轮」）。 */
  draft: string
  /** 携带的上下文正文（全文 / 选中文本；未携带为空串）。 */
  carryContext: string
  /** 面板是否激活：非激活时不发 IPC、不重算。 */
  active: boolean
}

export function useContextUsage({
  model,
  messages,
  draft,
  carryContext,
  active
}: UseContextUsageOptions): ContextUsage | null {
  const key = model.trim()
  /** 窗口解析完成后触发一次重渲染（缓存本体在模块级 Map，不进 React 状态）。 */
  const [, bump] = useState(0)

  useEffect(() => {
    if (!active || key === '' || limitCache.has(key)) return undefined
    const api = window.api?.ai
    if (!api) return undefined

    let cancelled = false
    void api.catalog
      .limit(key)
      .then((resolved) => {
        if (cancelled) return
        limitCache.set(key, resolved)
        bump((tick) => tick + 1)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [active, key])

  const cached = key === '' ? undefined : limitCache.get(key)

  return useMemo(() => {
    if (!active) return null

    const limit = cached ?? FALLBACK_LIMIT
    const usedTokens =
      estimateMessages(messages) + estimateTokens(draft) + estimateTokens(carryContext)

    return {
      usedTokens,
      limitTokens: limit.tokens,
      ratio: limit.tokens > 0 ? usedTokens / limit.tokens : 0,
      limitSource: limit.source,
      matchedId: limit.matchedId
    }
  }, [active, cached, messages, draft, carryContext])
}
