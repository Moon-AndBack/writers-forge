import { ipcMain } from 'electron'
import {
  MODEL_CACHE_TTL_MS,
  getAiConfig,
  getProviderBaseUrl,
  isAiProviderId,
  listModels,
  readModelCache,
  setAiConfig,
  streamChat,
  writeModelCache
} from '../ai'
import { toAiError } from '../ai/http'
import type { AiError, AiStreamEvent } from '../ai/types'
import {
  appendAiMessage,
  createAiSession,
  deleteAiSession,
  isAiMessageAction,
  listAiMessages,
  listAiSessions,
  renameAiSession,
  renameAiSessionIfEmpty
} from '../database/aiChat'
import type {
  AiChatMessageRow,
  AiChatRole,
  AiChatSessionRow,
  AiMessageAction,
  AiMessageStatus
} from '../database/aiChat'
import { logger } from '../logger'
import { abortChat, claimChat, sendStreamEvent } from './aiChat'
import {
  MAX_ID_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_USAGE_JSON_CHARS,
  isPositiveInt,
  isRecord,
  isTextWithin,
  readChatStartInput,
  readConfigPatch,
  readModelsListInput,
  readOpaqueId,
  readProviderInput
} from './aiValidate'

/**
 * AI 域 IPC（通道前缀 `ai:`）：只回传 `AiConfigView`（掩码）与脱敏 `AiError`，
 * 密钥明文与用户正文不出主进程。
 *
 * 全仓首个「主进程 → 渲染层」主动推送：流式事件经 `event.sender.send` 下发，
 * 在途请求由 `activeChats` 持有，窗口销毁时统一 abort + 清理。
 *
 * 拆分：入参校验见 `aiValidate.ts`，在途对话生命周期与推送见 `aiChat.ts`。
 */

const log = logger.scope('ai')

/** 模型列表 / 连通性测试的硬超时（毫秒）：避免设置页长时间挂起。 */
const PROBE_TIMEOUT_MS = 15_000

/** 数据库写操作：成功 debug、失败 error 并返回兜底值（错误不外抛给渲染层）。 */
function runWrite<T>(channel: string, ctx: Record<string, unknown>, fn: () => T, fallback: T): T {
  try {
    const result = fn()
    log.debug(`${channel} 完成`, ctx)
    return result
  } catch (error) {
    log.error(`${channel} 失败`, { ...ctx, error })
    return fallback
  }
}

/**
 * 模型列表结果：失败不抛错，改为 `ok=false` + 脱敏 `AiError`。
 *
 * `mode: 'cache'` 未命中时返回 `{ ok: false, source: 'cache' }`（**不带 error**），
 * 由渲染层据此改走 `refresh`；`refresh` 失败但本地有旧缓存时，回传旧列表 + `ok: false`，
 * 让 UI 保留内容。
 */
type ModelsResult = {
  ok: boolean
  models?: string[]
  error?: AiError
  /** 结果来源：本地缓存 / 本次联网。 */
  source?: 'cache' | 'network'
  /** 该列表的拉取时刻（毫秒时间戳）。 */
  fetchedAt?: number
  /** 缓存已超过有效期：内容可用，建议后台刷新。 */
  stale?: boolean
}

/** 连通性测试结果。 */
type TestResult = { ok: boolean; latencyMs: number; error?: AiError }

/**
 * 注册 AI 域 IPC。
 *
 * 通道：
 * - ai:config:get        ()                                      → AiConfigView
 * - ai:config:set        (patch)                                 → AiConfigUpdateResult
 * - ai:models:list       ({ provider, mode? })                   → { ok, models?, error?, source?, fetchedAt?, stale? }
 * - ai:test              ({ provider })                          → { ok, latencyMs, error? }
 * - ai:chat:start        (input)                                 → void（后续走事件）
 * - ai:chat:abort        ({ requestId })                         → boolean
 * - ai:sessions:list     ({ bookId })                              → AiChatSessionRow[]
 * - ai:sessions:create   ({ bookId, provider, model, title? })     → AiChatSessionRow | null
 * - ai:sessions:delete   ({ id })                                → boolean
 * - ai:sessions:rename   ({ id, title })                         → boolean
 * - ai:sessions:renameIfEmpty ({ id, title })                    → boolean（仅标题为空时写入）
 * - ai:messages:list     ({ sessionId })                         → AiChatMessageRow[]
 * - ai:messages:append   ({ sessionId, chapterId?, role, content, status?, action?, usageJson? }) → AiChatMessageRow | null
 * 推送（主进程 → 渲染层）：
 * - ai:chat:delta        { requestId, delta }
 * - ai:chat:done         { requestId, usage? }
 * - ai:chat:error        { requestId, error }
 */
export function registerAiIpc(): void {
  ipcMain.handle('ai:config:get', () => getAiConfig())

  ipcMain.handle('ai:config:set', (_event, input: unknown) => {
    const patch = readConfigPatch(input)
    if (!patch) {
      // 无「入参非法」错误码可用：按编程错误处理（reject），避免静默假装保存成功。
      log.warn('ai:config:set 入参非法')
      throw new TypeError('AI 配置入参非法')
    }
    const result = runWrite(
      'ai:config:set',
      { provider: patch.provider, hasApiKey: patch.apiKey !== undefined },
      () => setAiConfig(patch),
      null
    )
    if (!result) throw new Error('AI 配置写入失败')
    // 仅记录非敏感字段（密钥长度也不落盘，避免侧信道）。
    log.info('ai:config:set 完成', {
      provider: result.config.provider,
      model: result.config.model,
      apiKeyStored: result.apiKeyStored,
      apiKeyError: result.apiKeyError
    })
    return result
  })

  ipcMain.handle('ai:models:list', async (_event, input: unknown): Promise<ModelsResult> => {
    const parsed = readModelsListInput(input)
    if (!parsed) {
      log.warn('ai:models:list 入参非法')
      return { ok: false, error: { code: 'invalid_request', message: 'Invalid AI provider input' } }
    }

    const { provider, mode } = parsed
    // 缓存按「服务商 + 当前生效的 Base URL」归属；换地址后旧缓存自然失效。
    const baseUrl = getProviderBaseUrl(provider)

    if (mode === 'cache') {
      const cached = readModelCache(provider, baseUrl)
      if (!cached) {
        // 未命中不视为错误：不带 error，渲染层据此改发 refresh。
        log.debug('ai:models:list 缓存未命中', { provider })
        return { ok: false, source: 'cache' }
      }
      const stale = Date.now() - cached.fetchedAt >= MODEL_CACHE_TTL_MS
      log.debug('ai:models:list 命中缓存', { provider, count: cached.models.length, stale })
      return {
        ok: true,
        models: cached.models,
        source: 'cache',
        fetchedAt: cached.fetchedAt,
        stale
      }
    }

    // 以请求发起时刻作为 fetchedAt：慢的旧响应不会覆盖新的缓存。
    const startedAt = Date.now()
    try {
      const models = await listModels(provider, { timeoutMs: PROBE_TIMEOUT_MS })
      // 渲染层只消费 id；窗口随缓存落盘，供 `ai:catalog:limit` 的 provider 层使用。
      const ids = models.map((model) => model.id)
      if (ids.length === 0) {
        // 空列表不写缓存，避免瞬时异常把已有缓存打没。
        log.warn('ai:models:list 返回空列表，不写缓存', { provider })
        return { ok: true, models: ids, source: 'network' }
      }
      const fetchedAt = writeModelCache(provider, baseUrl, models, startedAt) ?? startedAt
      log.debug('ai:models:list 完成（联网）', { provider, count: ids.length })
      return { ok: true, models: ids, source: 'network', fetchedAt }
    } catch (error) {
      const aiError = toAiError(error)
      const cached = readModelCache(provider, baseUrl)
      log.warn('ai:models:list 刷新失败', {
        provider,
        code: aiError.code,
        status: aiError.status,
        hasCache: cached !== null
      })
      return cached
        ? {
            ok: false,
            models: cached.models,
            source: 'cache',
            fetchedAt: cached.fetchedAt,
            stale: true,
            error: aiError
          }
        : { ok: false, source: 'network', error: aiError }
    }
  })

  ipcMain.handle('ai:test', async (_event, input: unknown): Promise<TestResult> => {
    const provider = readProviderInput(input)
    if (!provider) {
      log.warn('ai:test 入参非法')
      return {
        ok: false,
        latencyMs: 0,
        error: { code: 'invalid_request', message: 'Invalid AI provider input' }
      }
    }
    const startedAt = Date.now()
    try {
      // 强制走网络：不复用模型缓存，否则「测试连接」测到的是旧结果。
      await listModels(provider, { timeoutMs: PROBE_TIMEOUT_MS })
      const latencyMs = Date.now() - startedAt
      log.info('ai:test 成功', { provider, latencyMs })
      return { ok: true, latencyMs }
    } catch (error) {
      const aiError = toAiError(error)
      const latencyMs = Date.now() - startedAt
      log.warn('ai:test 失败', { provider, latencyMs, code: aiError.code, status: aiError.status })
      return { ok: false, latencyMs, error: aiError }
    }
  })

  ipcMain.handle('ai:chat:start', (event, input: unknown) => {
    const parsed = readChatStartInput(input)
    if (!parsed) {
      log.warn('ai:chat:start 入参非法')
      throw new TypeError('AI 对话入参非法')
    }

    const sender = event.sender
    // 同一 sender 复用同一 requestId 视为「重启」：claimChat 内先中止旧请求，避免事件串流。
    const leased = claimChat(sender, parsed.requestId)

    const requestId = parsed.requestId
    const provider = parsed.provider ?? getAiConfig().provider
    log.debug('ai:chat:start', { provider, requestId, messages: parsed.messages.length })

    const onEvent = (streamEvent: AiStreamEvent): void => {
      if (streamEvent.type === 'done' || streamEvent.type === 'error') {
        leased.release()
        log.debug('ai:chat 结束', {
          requestId,
          type: streamEvent.type,
          code: streamEvent.type === 'error' ? streamEvent.error.code : undefined
        })
      }
      sendStreamEvent(sender, streamEvent)
    }

    // 能力层内部已兜底异常（转 error 事件）；此处的 catch 只防御未知同步失败，
    // 保证渲染层永远不会等不到 done / error。
    void streamChat(
      provider,
      parsed.messages,
      {
        requestId,
        ...(parsed.sessionId !== undefined ? { sessionId: parsed.sessionId } : {}),
        ...(parsed.model !== undefined ? { model: parsed.model } : {}),
        ...(parsed.temperature !== undefined ? { temperature: parsed.temperature } : {}),
        ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
        signal: leased.controller.signal
      },
      onEvent
    ).catch((error: unknown) => {
      const aiError = toAiError(error)
      log.error('ai:chat 未预期失败', { requestId, code: aiError.code })
      leased.release()
      sendStreamEvent(sender, { type: 'error', requestId, error: aiError })
    })
  })

  ipcMain.handle('ai:chat:abort', (event, input: unknown) => {
    if (!isRecord(input)) return false
    const requestId = readOpaqueId(input.requestId)
    if (!requestId) return false

    return abortChat(event.sender.id, requestId)
  })

  ipcMain.handle('ai:sessions:list', (_event, input: unknown) => {
    if (!isRecord(input)) return []
    const { bookId } = input
    if (!isTextWithin(bookId, MAX_ID_CHARS) || bookId === '') return []
    return listAiSessions(bookId)
  })

  ipcMain.handle('ai:sessions:create', (_event, input: unknown): AiChatSessionRow | null => {
    if (!isRecord(input)) return null
    const { bookId, model, title } = input
    const provider = input.provider
    if (!isTextWithin(bookId, MAX_ID_CHARS) || bookId === '') return null
    if (!isAiProviderId(provider)) return null
    if (!isTextWithin(model, MAX_ID_CHARS)) return null
    if (title !== undefined && !isTextWithin(title, MAX_ID_CHARS)) return null

    return runWrite(
      'ai:sessions:create',
      { bookId, provider, model },
      () =>
        createAiSession({
          bookId,
          provider,
          model,
          ...(title !== undefined ? { title } : {})
        }),
      null
    )
  })

  ipcMain.handle('ai:sessions:delete', (_event, input: unknown) => {
    if (!isRecord(input) || !isPositiveInt(input.id)) return false
    const { id } = input
    return runWrite('ai:sessions:delete', { id }, () => deleteAiSession(id), false)
  })

  ipcMain.handle('ai:sessions:rename', (_event, input: unknown) => {
    if (!isRecord(input) || !isPositiveInt(input.id)) return false
    const { id, title } = input
    if (!isTextWithin(title, MAX_ID_CHARS)) return false
    return runWrite('ai:sessions:rename', { id }, () => renameAiSession(id, title), false)
  })

  // 自动命名专用：空标题守卫在 SQL 内原子完成，不会覆盖用户手动改的名。
  ipcMain.handle('ai:sessions:renameIfEmpty', (_event, input: unknown) => {
    if (!isRecord(input) || !isPositiveInt(input.id)) return false
    const { id, title } = input
    if (!isTextWithin(title, MAX_ID_CHARS) || title === '') return false
    return runWrite(
      'ai:sessions:renameIfEmpty',
      { id },
      () => renameAiSessionIfEmpty(id, title),
      false
    )
  })

  ipcMain.handle('ai:messages:list', (_event, input: unknown) => {
    if (!isRecord(input) || !isPositiveInt(input.sessionId)) return []
    return listAiMessages(input.sessionId)
  })

  ipcMain.handle('ai:messages:append', (_event, input: unknown): AiChatMessageRow | null => {
    if (!isRecord(input)) return null
    const { sessionId, chapterId, role, content, status, action, usageJson } = input
    if (!isPositiveInt(sessionId)) return null
    // `chapterId` 是纯标记字段：省略 / null 表示无章聊天；给了就必须是正整数。
    if (chapterId !== undefined && chapterId !== null && !isPositiveInt(chapterId)) return null
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
    if (!isTextWithin(content, MAX_MESSAGE_CHARS)) return null
    if (status !== undefined && status !== 'done' && status !== 'interrupted') return null
    // `action` 是功能类型标记：省略 / null 表示未知（历史行为）；给了就必须是枚举值之一。
    if (action !== undefined && action !== null && !isAiMessageAction(action)) return null
    if (
      usageJson !== undefined &&
      usageJson !== null &&
      !isTextWithin(usageJson, MAX_USAGE_JSON_CHARS)
    ) {
      return null
    }
    const safeRole: AiChatRole = role
    const safeChapterId: number | null = isPositiveInt(chapterId) ? chapterId : null
    const safeStatus: AiMessageStatus | undefined =
      status === 'done' || status === 'interrupted' ? status : undefined
    const safeAction: AiMessageAction | null = isAiMessageAction(action) ? action : null

    return runWrite(
      'ai:messages:append',
      {
        sessionId,
        chapterId: safeChapterId,
        role: safeRole,
        status: safeStatus ?? 'done',
        action: safeAction
      },
      () =>
        appendAiMessage({
          sessionId,
          chapterId: safeChapterId,
          role: safeRole,
          content,
          ...(safeStatus !== undefined ? { status: safeStatus } : {}),
          action: safeAction,
          ...(usageJson !== undefined ? { usageJson } : {})
        }),
      null
    )
  })
}
