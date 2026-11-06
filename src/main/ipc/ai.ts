import { ipcMain } from 'electron'
import { getAiConfig, isAiProviderId, listModels, setAiConfig, streamChat } from '../ai'
import { toAiError } from '../ai/http'
import type { AiError, AiStreamEvent } from '../ai/types'
import {
  appendAiMessage,
  createAiSession,
  deleteAiSession,
  listAiMessages,
  listAiSessions,
  renameAiSession
} from '../database/aiChat'
import type {
  AiChatMessageRow,
  AiChatRole,
  AiChatSessionRow,
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

/** 模型列表结果：失败不抛错，改为 `ok=false` + 脱敏 `AiError`。 */
type ModelsResult = { ok: boolean; models?: string[]; error?: AiError }

/** 连通性测试结果。 */
type TestResult = { ok: boolean; latencyMs: number; error?: AiError }

/**
 * 注册 AI 域 IPC。
 *
 * 通道：
 * - ai:config:get        ()                                      → AiConfigView
 * - ai:config:set        (patch)                                 → AiConfigUpdateResult
 * - ai:models:list       ({ provider })                          → { ok, models?, error? }
 * - ai:test              ({ provider })                          → { ok, latencyMs, error? }
 * - ai:chat:start        (input)                                 → void（后续走事件）
 * - ai:chat:abort        ({ requestId })                         → boolean
 * - ai:sessions:list     ({ bookId, chapterId })                 → AiChatSessionRow[]
 * - ai:sessions:create   ({ bookId, chapterId, provider, model, title? }) → AiChatSessionRow | null
 * - ai:sessions:delete   ({ id })                                → boolean
 * - ai:sessions:rename   ({ id, title })                         → boolean
 * - ai:messages:list     ({ sessionId })                         → AiChatMessageRow[]
 * - ai:messages:append   ({ sessionId, role, content, status?, usageJson? }) → AiChatMessageRow | null
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
    const provider = readProviderInput(input)
    if (!provider) {
      log.warn('ai:models:list 入参非法')
      return { ok: false, error: { code: 'invalid_request', message: 'Invalid AI provider input' } }
    }
    try {
      const models = await listModels(provider, { timeoutMs: PROBE_TIMEOUT_MS })
      log.debug('ai:models:list 完成', { provider, count: models.length })
      return { ok: true, models }
    } catch (error) {
      const aiError = toAiError(error)
      log.warn('ai:models:list 失败', { provider, code: aiError.code, status: aiError.status })
      return { ok: false, error: aiError }
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
    const { bookId, chapterId } = input
    if (!isTextWithin(bookId, MAX_ID_CHARS) || bookId === '') return []
    if (!isPositiveInt(chapterId)) return []
    return listAiSessions(bookId, chapterId)
  })

  ipcMain.handle('ai:sessions:create', (_event, input: unknown): AiChatSessionRow | null => {
    if (!isRecord(input)) return null
    const { bookId, chapterId, model, title } = input
    const provider = input.provider
    if (!isTextWithin(bookId, MAX_ID_CHARS) || bookId === '') return null
    if (!isPositiveInt(chapterId)) return null
    if (!isAiProviderId(provider)) return null
    if (!isTextWithin(model, MAX_ID_CHARS)) return null
    if (title !== undefined && !isTextWithin(title, MAX_ID_CHARS)) return null

    return runWrite(
      'ai:sessions:create',
      { bookId, chapterId, provider, model },
      () =>
        createAiSession({
          bookId,
          chapterId,
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

  ipcMain.handle('ai:messages:list', (_event, input: unknown) => {
    if (!isRecord(input) || !isPositiveInt(input.sessionId)) return []
    return listAiMessages(input.sessionId)
  })

  ipcMain.handle('ai:messages:append', (_event, input: unknown): AiChatMessageRow | null => {
    if (!isRecord(input)) return null
    const { sessionId, role, content, status, usageJson } = input
    if (!isPositiveInt(sessionId)) return null
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null
    if (!isTextWithin(content, MAX_MESSAGE_CHARS)) return null
    if (status !== undefined && status !== 'done' && status !== 'interrupted') return null
    if (
      usageJson !== undefined &&
      usageJson !== null &&
      !isTextWithin(usageJson, MAX_USAGE_JSON_CHARS)
    ) {
      return null
    }
    const safeRole: AiChatRole = role
    const safeStatus: AiMessageStatus | undefined =
      status === 'done' || status === 'interrupted' ? status : undefined

    return runWrite(
      'ai:messages:append',
      { sessionId, role: safeRole, status: safeStatus ?? 'done' },
      () =>
        appendAiMessage({
          sessionId,
          role: safeRole,
          content,
          ...(safeStatus !== undefined ? { status: safeStatus } : {}),
          ...(usageJson !== undefined ? { usageJson } : {})
        }),
      null
    )
  })
}
