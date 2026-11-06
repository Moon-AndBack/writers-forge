import { ipcMain } from 'electron'
import { DEFAULT_CONTEXT_WINDOW, resolveContextLimit } from '../ai/modelMatch'
import type { ResolvedLimit } from '../ai/modelMatch'
import { fetchCatalog } from '../ai/catalog'
import { isCatalogStale, readCatalog, writeCatalog, writeOverride } from '../ai/catalogCache'
import { toAiError } from '../ai/http'
import type { AiCatalogMeta, AiError } from '../ai/types'
import { logger } from '../logger'
import { MAX_ID_CHARS, isRecord, isTextWithin } from './aiValidate'

/**
 * 模型上下文窗口目录 IPC（通道前缀 `ai:catalog:`）。
 *
 * 通道：
 * - ai:catalog:get      ({ mode?: 'cache' | 'refresh' }) → AiCatalogMeta
 * - ai:catalog:limit    ({ model })                      → ResolvedLimit
 * - ai:catalog:override ({ model, tokens: number | null }) → boolean
 *
 * 说明：`ai:` 前缀的 settings 键渲染层不可读写（见 `ipc/settings.ts`），
 * 因此目录能力必须走本组专用通道，不能借 `settings:*`。
 */

const log = logger.scope('ai:catalog')

/** 目录刷新超时（毫秒）：与 `ipc/ai.ts` 的 `PROBE_TIMEOUT_MS` 语义一致。 */
const CATALOG_TIMEOUT_MS = 15_000

type CatalogMode = 'cache' | 'refresh'

function readCatalogInput(input: unknown): { mode: CatalogMode } | null {
  if (!isRecord(input)) return null
  const mode = input.mode
  if (mode === undefined) return { mode: 'cache' }
  if (mode === 'cache' || mode === 'refresh') return { mode }
  return null
}

function readModelInput(input: unknown): string | null {
  if (!isRecord(input) || !isTextWithin(input.model, MAX_ID_CHARS)) return null
  const model = input.model.trim()
  return model === '' ? null : model
}

/** 把当前缓存转成元信息（不返回全量条目）。 */
function readCachedMeta(): AiCatalogMeta | null {
  const cached = readCatalog()
  if (!cached) return null
  return {
    ok: true,
    fetchedAt: cached.fetchedAt,
    stale: isCatalogStale(cached.fetchedAt),
    count: Object.keys(cached.entries).length
  }
}

/** 失败时保留旧缓存：有缓存则附带缓存元信息，无缓存只回错误。 */
function withCachedMeta(error: AiError): AiCatalogMeta {
  const cached = readCachedMeta()
  if (!cached) return { ok: false, error }
  return {
    ok: false,
    fetchedAt: cached.fetchedAt,
    stale: cached.stale,
    count: cached.count,
    error
  }
}

/** 注册模型上下文窗口目录 IPC。 */
export function registerAiCatalogIpc(): void {
  ipcMain.handle('ai:catalog:get', async (_event, input: unknown): Promise<AiCatalogMeta> => {
    const parsed = readCatalogInput(input)
    if (!parsed) {
      log.warn('ai:catalog:get 入参非法')
      return { ok: false, error: { code: 'invalid_request', message: 'Invalid catalog input' } }
    }

    if (parsed.mode === 'cache') {
      const meta = readCachedMeta()
      if (!meta) {
        // 未命中不视为错误：不带 error，渲染层据此展示「尚未获取」。
        log.debug('ai:catalog:get 缓存未命中')
        return { ok: false }
      }
      log.debug('ai:catalog:get 命中缓存', { count: meta.count, stale: meta.stale })
      return meta
    }

    // 以请求发起时刻作为 fetchedAt：慢的旧响应不会覆盖新的缓存。
    const startedAt = Date.now()
    try {
      const entries = await fetchCatalog({ timeoutMs: CATALOG_TIMEOUT_MS })
      if (entries.length === 0) {
        log.warn('ai:catalog:get 返回空目录，不写缓存')
        return withCachedMeta({ code: 'upstream', message: 'Empty model catalog' })
      }

      const record: Record<string, number> = {}
      for (const entry of entries) record[entry.id] = entry.contextLength

      const fetchedAt = writeCatalog(record, startedAt)
      if (fetchedAt === null) {
        // 写入失败（磁盘 / 序列化异常）：保留旧缓存，按失败上报。
        return withCachedMeta({ code: 'unknown', message: 'Catalog cache write failed' })
      }

      const count = Object.keys(record).length
      log.debug('ai:catalog:get 完成（联网）', { count })
      return { ok: true, fetchedAt, stale: false, count }
    } catch (error) {
      const aiError = toAiError(error)
      log.warn('ai:catalog:get 刷新失败', { code: aiError.code, status: aiError.status })
      return withCachedMeta(aiError)
    }
  })

  ipcMain.handle('ai:catalog:limit', (_event, input: unknown): ResolvedLimit => {
    const model = readModelInput(input)
    if (model === null) {
      log.warn('ai:catalog:limit 入参非法')
      return {
        tokens: DEFAULT_CONTEXT_WINDOW,
        source: 'default',
        confidence: 'default',
        matchedId: null
      }
    }
    return resolveContextLimit(model)
  })

  ipcMain.handle('ai:catalog:override', (_event, input: unknown): boolean => {
    const model = readModelInput(input)
    if (model === null) return false
    if (!isRecord(input)) return false

    const tokens = input.tokens
    if (
      tokens !== null &&
      (typeof tokens !== 'number' || !Number.isFinite(tokens) || !Number.isInteger(tokens))
    ) {
      return false
    }

    const ok = writeOverride(model, tokens)
    log.debug('ai:catalog:override 完成', { model, cleared: tokens === null, ok })
    return ok
  })
}
