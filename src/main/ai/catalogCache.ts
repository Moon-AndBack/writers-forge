import { deleteSetting, getSetting, setSetting } from '../database/settings'
import { logger } from '../logger'

/**
 * 模型上下文窗口目录与用户覆写的本地缓存。
 *
 * 存储：`settings` 表（现成 KV，不改表结构）。
 * - 目录：`ai:context:v1:catalog` = `{ fetchedAt, entries: Record<orId, contextLength> }`
 * - 覆写：`ai:context:override:v1` = `Record<ourModelId, number>`
 *
 * 与 `modelCache.ts` 完全独立：目录生命周期为 7 天且与 Base URL 无关，
 * 模型列表缓存为 12 小时且按服务商 + Base URL 归属，不能共用一套键。
 *
 * 并发语义：`fetchedAt` 取**请求发起时刻**，写入前与已有条目比较，
 * 只有更新的请求才能覆盖，避免慢的旧响应把新响应盖掉。
 */

const log = logger.scope('ai:catalog:cache')

/** 目录有效期（7 天）。过期仍可读，由上层决定是否后台刷新。 */
export const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** settings 键（版本化，便于将来换结构）。 */
const CATALOG_KEY = 'ai:context:v1:catalog'
const OVERRIDE_KEY = 'ai:context:override:v1'

/** 条目数 / 标识长度 / 上下文窗口区间上限：防止异常上游把 settings 撑爆。 */
const MAX_ENTRIES = 1_000
const MAX_ID_CHARS = 200
const MIN_CONTEXT_TOKENS = 1_024
const MAX_CONTEXT_TOKENS = 10_000_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/** 清洗目录条目：丢弃非法 id / 非法窗口 / 重复项，并截断到上限。 */
function sanitizeEntries(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}

  const entries: Record<string, number> = {}
  let count = 0
  for (const [rawId, rawTokens] of Object.entries(value)) {
    if (count >= MAX_ENTRIES) break
    const id = rawId.trim()
    if (!id || id.length > MAX_ID_CHARS) continue
    if (!isValidContextTokens(rawTokens)) continue
    entries[id] = Math.round(rawTokens)
    count += 1
  }
  return entries
}

function sanitizeOverrides(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}

  const overrides: Record<string, number> = {}
  let count = 0
  for (const [rawModel, rawTokens] of Object.entries(value)) {
    if (count >= MAX_ENTRIES) break
    const model = rawModel.trim().toLowerCase()
    if (!model || model.length > MAX_ID_CHARS) continue
    if (!isValidContextTokens(rawTokens)) continue
    overrides[model] = Math.round(rawTokens)
    count += 1
  }
  return overrides
}

/**
 * 读取目录缓存。
 *
 * JSON 解析失败 / 结构非法 / 无有效条目 → 返回 null（按未命中处理）。
 */
export function readCatalog(): { entries: Record<string, number>; fetchedAt: number } | null {
  const raw = getSetting(CATALOG_KEY)
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    log.warn('目录缓存 JSON 解析失败，按未命中处理')
    return null
  }
  if (!isRecord(parsed)) return null

  const { fetchedAt } = parsed
  if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt) || fetchedAt <= 0) return null

  const entries = sanitizeEntries(parsed.entries)
  if (Object.keys(entries).length === 0) return null

  return { entries, fetchedAt }
}

/**
 * 写入目录缓存。
 *
 * - 空目录一律不写（避免瞬时异常把已有缓存打没）；
 * - 仅当 `startedAt` 比已有条目的 `fetchedAt` 更新时才写（并发保护）；
 * - 返回最终生效的 `fetchedAt`（跳过写入时返回已有条目的），失败返回 null。
 */
export function writeCatalog(
  entries: Record<string, number>,
  startedAt: number = Date.now()
): number | null {
  const sanitized = sanitizeEntries(entries)
  if (Object.keys(sanitized).length === 0) return null

  const fetchedAt = Math.max(1, Math.floor(startedAt))
  const existing = readCatalog()
  if (existing && existing.fetchedAt >= fetchedAt) {
    log.debug('已有更新的目录缓存，跳过本次写入')
    return existing.fetchedAt
  }

  try {
    setSetting(CATALOG_KEY, JSON.stringify({ fetchedAt, entries: sanitized }))
  } catch (error) {
    log.warn('目录缓存写入失败', { error })
    return null
  }
  return fetchedAt
}

/** 目录是否已超过有效期。 */
export function isCatalogStale(fetchedAt: number): boolean {
  return Date.now() - fetchedAt >= CATALOG_TTL_MS
}

/** 读取用户覆写（键统一为 trim + 小写的模型名）。 */
export function readOverrides(): Record<string, number> {
  const raw = getSetting(OVERRIDE_KEY)
  if (raw === null) return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    log.warn('模型覆写 JSON 解析失败，按未命中处理')
    return {}
  }
  return sanitizeOverrides(parsed)
}

/** 覆写是否为空：为空时删除键，避免留下 `{}` 垃圾值。 */
function persistOverrides(overrides: Record<string, number>): boolean {
  try {
    if (Object.keys(overrides).length === 0) deleteSetting(OVERRIDE_KEY)
    else setSetting(OVERRIDE_KEY, JSON.stringify(overrides))
    return true
  } catch (error) {
    log.warn('模型覆写写入失败', { error })
    return false
  }
}

/**
 * 写入 / 清除用户覆写。
 *
 * `tokens === null` 表示清除；模型键统一 trim + 小写存储。
 * 入参非法（空模型名 / 越界窗口）返回 false 且不落库。
 */
export function writeOverride(model: string, tokens: number | null): boolean {
  const key = model.trim().toLowerCase()
  if (!key || key.length > MAX_ID_CHARS) return false

  const current = readOverrides()
  if (tokens === null) {
    if (!Object.hasOwn(current, key)) return true
    delete current[key]
    return persistOverrides(current)
  }

  if (!isValidContextTokens(tokens)) return false
  current[key] = Math.round(tokens)
  return persistOverrides(current)
}
