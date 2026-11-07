import { getSetting, setSetting } from '../database/settings'
import { logger } from '../logger'
import type { AiModelCacheEntry, AiModelInfo, AiProviderId } from './types'

/**
 * AI 模型列表的本地缓存。
 *
 * 存储：`settings` 表（现成 KV，不改表结构），键 `ai:models:v1:<provider>`，
 * 值为 `{ baseUrl, models, contexts?, fetchedAt }` 的 JSON 文本。
 *
 * 为什么带 `baseUrl`：DeepSeek 支持自定义中转站，换地址后模型集可能不同，
 * 读取时比对当前 Base URL，不一致即视为无缓存。
 *
 * 并发语义：`fetchedAt` 取**请求发起时刻**而非写入时刻，写入前与已有条目比较，
 * 只有更新的请求才能覆盖，避免慢的旧响应把新响应盖掉。
 */

const log = logger.scope('ai:models:cache')

/** 缓存有效期（12 小时）。过期仍可读，由上层决定是否后台刷新。 */
export const MODEL_CACHE_TTL_MS = 12 * 60 * 60 * 1000

/** settings 键前缀（版本化，便于将来换结构）。 */
const CACHE_KEY_PREFIX = 'ai:models:v1:'

/** 模型 ID 长度与条数上限：防止异常上游把 settings 撑爆。 */
const MAX_MODEL_ID_CHARS = 200
const MAX_MODELS = 500

/** 自报窗口合理区间：越界值一律丢弃（与目录 / 适配器保持同口径）。 */
const MIN_CONTEXT_TOKENS = 1_024
const MAX_CONTEXT_TOKENS = 10_000_000

function cacheKey(provider: AiProviderId): string {
  return `${CACHE_KEY_PREFIX}${provider}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 清洗模型列表：丢弃非字符串 / 空串 / 超长 / 重复项，并截断到上限。 */
function sanitizeModels(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const models: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || id.length > MAX_MODEL_ID_CHARS || seen.has(id)) continue
    seen.add(id)
    models.push(id)
    if (models.length >= MAX_MODELS) break
  }
  return models
}

/** 有限数字且落在合理区间。 */
function isValidContextTokens(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_CONTEXT_TOKENS &&
    value <= MAX_CONTEXT_TOKENS
  )
}

/**
 * 清洗自报窗口表：键统一 trim + 小写，丢弃非法值，并只保留 `models` 内的 id
 * （避免旧缓存残留脏键 / 已下线模型）。
 */
function sanitizeContexts(value: unknown, models: readonly string[]): Record<string, number> {
  if (!isRecord(value)) return {}

  const valid = new Set(models.map((id) => id.trim().toLowerCase()))
  const contexts: Record<string, number> = {}
  let count = 0
  for (const [rawId, rawTokens] of Object.entries(value)) {
    if (count >= MAX_MODELS) break
    const id = rawId.trim().toLowerCase()
    if (!id || id.length > MAX_MODEL_ID_CHARS || !valid.has(id)) continue
    if (!isValidContextTokens(rawTokens)) continue
    contexts[id] = Math.round(rawTokens)
    count += 1
  }
  return contexts
}

/** 读取原始缓存项（不校验 baseUrl，供写入时比较新旧顺序）。 */
function readRawEntry(provider: AiProviderId): AiModelCacheEntry | null {
  const raw = getSetting(cacheKey(provider))
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    log.warn('模型缓存 JSON 解析失败，按未命中处理', { provider })
    return null
  }
  if (!isRecord(parsed)) return null

  const { baseUrl, fetchedAt } = parsed
  if (typeof baseUrl !== 'string') return null
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return null

  const models = sanitizeModels(parsed.models)
  if (models.length === 0) return null

  return { baseUrl, models, contexts: sanitizeContexts(parsed.contexts, models), fetchedAt }
}

/**
 * 读取可用缓存。
 *
 * 结构非法 / JSON 解析失败 / Base URL 不匹配 / 无有效模型 → 返回 null（按没有缓存处理）。
 */
export function readModelCache(
  provider: AiProviderId,
  currentBaseUrl: string
): { models: string[]; contexts: Record<string, number>; fetchedAt: number } | null {
  const entry = readRawEntry(provider)
  if (!entry) return null
  if (entry.baseUrl !== currentBaseUrl) {
    log.debug('模型缓存 Base URL 不匹配，按未命中处理', { provider })
    return null
  }
  return { models: entry.models, contexts: entry.contexts ?? {}, fetchedAt: entry.fetchedAt }
}

/**
 * 从模型信息构建「小写 id → 自报窗口」原始表（同 id 只取首个）。
 */
function collectContexts(
  models: readonly AiModelInfo[],
  list: readonly string[]
): Record<string, number> {
  const raw: Record<string, number> = {}
  for (const model of models) {
    const id = model.id.trim().toLowerCase()
    if (!id || model.contextLength === undefined) continue
    if (!isValidContextTokens(model.contextLength)) continue
    if (Object.hasOwn(raw, id)) continue
    raw[id] = model.contextLength
  }
  return sanitizeContexts(raw, list)
}

/**
 * 写入缓存。
 *
 * - `models` 为空一律不写（避免 401 / 瞬时空结果把缓存打没）；
 * - 仅当 `startedAt` 比已有条目的 `fetchedAt` 更新时才写（并发保护）；
 * - 同时写入 `models`（ID 数组）与 `contexts`（小写 ID → 自报窗口）；
 * - 返回最终生效的 `fetchedAt`（跳过写入时返回已有条目的），失败返回 null。
 */
export function writeModelCache(
  provider: AiProviderId,
  baseUrl: string,
  models: AiModelInfo[],
  startedAt: number = Date.now()
): number | null {
  const list = sanitizeModels(models.map((model) => model.id))
  if (list.length === 0) return null

  const fetchedAt = Math.max(1, Math.floor(startedAt))
  const existing = readRawEntry(provider)
  if (existing && existing.fetchedAt >= fetchedAt) {
    log.debug('已有更新的模型缓存，跳过本次写入', { provider })
    return existing.fetchedAt
  }

  const contexts = collectContexts(models, list)
  const payload: AiModelCacheEntry = {
    baseUrl,
    models: list,
    ...(Object.keys(contexts).length > 0 ? { contexts } : {}),
    fetchedAt
  }
  try {
    setSetting(cacheKey(provider), JSON.stringify(payload))
  } catch (error) {
    log.warn('模型缓存写入失败', { provider, error })
    return null
  }
  return fetchedAt
}
