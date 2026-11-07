import { useEffect, useMemo, useState } from 'react'
import type { AiProviderId, ResolvedLimit } from '../../../../../../preload/types/ai'
import {
  DEFAULT_CONTEXT_WINDOW,
  calibrateForModel,
  estimateMessages,
  estimateTokens,
  type ContextUsage
} from './contextBudget'

/**
 * AI 面板上下文占用（估算）。
 *
 * - 窗口值来自主进程解析（`ai:catalog:limit`）：**按 `服务商:模型` 缓存**，同一键不重复 IPC；
 * - 已用 = 未压缩历史（含每条开销）+ 已存摘要 + 输入框草稿 + 携带的正文；
 * - `active === false`（面板未激活）时不发 IPC、不重算，直接返回 null；
 * - 本 hook 只读估算；发送 / 拒绝 / 压缩决策在 `contextSummary.ts`。
 *
 * 缓存失效：目录刷新、模型列表刷新或用户覆写窗口后调用 `invalidateLimitCache()`，
 * 否则旧窗口会一直沿用到进程重启（例如刷新目录后新模型窗口变大，占用条仍按旧值显示）。
 */

/** 窗口缓存：`provider:模型 ID` → 主进程解析结果；跨面板开关与组件重挂复用。 */
const limitCache = new Map<string, ResolvedLimit>()

/** 缓存键：服务商 + 模型（避免两个服务商同名模型串值）。 */
function limitCacheKey(model: string, provider?: AiProviderId): string {
  return `${provider ?? ''}:${model.trim()}`
}

/** 缓存失效订阅者：已挂载的面板收到通知后重跑一次 `ai:catalog:limit`。 */
const limitCacheListeners = new Set<() => void>()

/** IPC 不可用 / 解析失败时的兜底：按默认窗口估算（未知模型 1M，UI 标注「未知模型」）。 */
const FALLBACK_LIMIT: ResolvedLimit = {
  tokens: DEFAULT_CONTEXT_WINDOW,
  source: 'default',
  confidence: 'default',
  matchedId: null
}

/** 清空窗口缓存：不传模型则全清；传模型则清该模型在所有服务商下的条目。 */
export function invalidateLimitCache(model?: string): void {
  if (model === undefined) {
    limitCache.clear()
  } else {
    const suffix = `:${model.trim()}`
    for (const key of [...limitCache.keys()]) {
      if (key.endsWith(suffix)) limitCache.delete(key)
    }
  }
  // 已挂载的占用条不会因缓存清空自动重渲染，主动通知一次。
  for (const listener of [...limitCacheListeners]) listener()
}

/**
 * 解析模型窗口（缓存优先）——供发送链路同步取限额。
 *
 * 与 hook 内的加载逻辑共用同一张 `limitCache`，避免「占用条显示一个值、
 * 压缩判定用另一个值」。
 */
export async function resolveContextLimit(
  model: string,
  provider?: AiProviderId
): Promise<ResolvedLimit> {
  const modelKey = model.trim()
  if (modelKey === '') return FALLBACK_LIMIT
  const key = limitCacheKey(modelKey, provider)

  const cached = limitCache.get(key)
  if (cached) return cached

  const api = window.api?.ai
  if (!api) return FALLBACK_LIMIT

  try {
    const resolved = await api.catalog.limit(modelKey, provider)
    limitCache.set(key, resolved)
    return resolved
  } catch {
    return FALLBACK_LIMIT
  }
}

/**
 * 用户手填窗口（`ai:catalog:override`）后调用：写库并即时失效该模型缓存。
 * 第 4 步的「手填窗口」入口应走本函数，不要直接调 IPC 后忘记清缓存。
 */
export async function overrideContextLimit(model: string, tokens: number | null): Promise<boolean> {
  const api = window.api?.ai
  if (!api) return false
  try {
    const ok = await api.catalog.override(model, tokens)
    if (ok) invalidateLimitCache(model)
    return ok
  } catch {
    return false
  }
}

export interface UseContextUsageOptions {
  model: string
  /** 当前服务商：用于区分同名模型的窗口缓存（缺省跳过自报层）。 */
  provider?: AiProviderId
  /** 当前会话的消息（不含 system；可含压缩分隔行，统计时自动跳过）。 */
  messages: readonly { content: string; divider?: unknown }[]
  /** 已被摘要覆盖的消息条数（这些消息不再随请求发送）。 */
  covered?: number
  /** 已存摘要正文（会被并入 system 一并发送）。 */
  summaryText?: string
  /** 当前输入框内容（计入「预估下一轮」）。 */
  draft: string
  /** 携带的上下文正文（全文 / 选中文本；未携带为空串）。 */
  carryContext: string
  /** 面板是否激活：非激活时不发 IPC、不重算。 */
  active: boolean
}

export function useContextUsage({
  model,
  provider,
  messages,
  covered = 0,
  summaryText = '',
  draft,
  carryContext,
  active
}: UseContextUsageOptions): ContextUsage | null {
  const modelKey = model.trim()
  const cacheKey = limitCacheKey(modelKey, provider)
  /** 窗口解析完成后触发一次重渲染（缓存本体在模块级 Map，不进 React 状态）。 */
  const [, bump] = useState(0)
  /** 缓存失效信号：目录刷新 / 覆写后重跑一次解析。 */
  const [cacheEpoch, setCacheEpoch] = useState(0)

  useEffect(() => {
    const listener = (): void => setCacheEpoch((tick) => tick + 1)
    limitCacheListeners.add(listener)
    return () => {
      limitCacheListeners.delete(listener)
    }
  }, [])

  useEffect(() => {
    if (!active || modelKey === '' || limitCache.has(cacheKey)) return undefined
    const api = window.api?.ai
    if (!api) return undefined

    let cancelled = false
    void api.catalog
      .limit(modelKey, provider)
      .then((resolved) => {
        if (cancelled) return
        limitCache.set(cacheKey, resolved)
        bump((tick) => tick + 1)
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [active, modelKey, cacheKey, provider, cacheEpoch])

  const cached = modelKey === '' ? undefined : limitCache.get(cacheKey)

  return useMemo(() => {
    if (!active) return null

    const limit = cached ?? FALLBACK_LIMIT
    // 分隔行不是消息，不参与已用统计（也不占 covered 的计数）。
    const live = messages.filter((message) => message.divider === undefined)
    const visible = covered > 0 ? live.slice(Math.max(0, covered)) : live
    const rawTokens =
      estimateMessages(visible) +
      estimateTokens(summaryText) +
      estimateTokens(draft) +
      estimateTokens(carryContext)
    // 展示「校准后估算」：按最近真实 usage 修正估算偏差（发送决策仍用原始估算）。
    const usedTokens = calibrateForModel(modelKey, rawTokens)

    return {
      usedTokens,
      limitTokens: limit.tokens,
      ratio: limit.tokens > 0 ? usedTokens / limit.tokens : 0,
      limitSource: limit.source,
      matchedId: limit.matchedId,
      calibrated: usedTokens !== rawTokens
    }
  }, [active, cached, modelKey, messages, covered, summaryText, draft, carryContext])
}
