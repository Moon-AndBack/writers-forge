import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { getAiConfig, streamChat } from '../ai'
import type { AiError, AiUsage } from '../ai/types'
import { logger } from '../logger'
import { readCompleteInput } from './aiValidate'

/**
 * 非流式一次性补全（通道 `ai:chat:complete`）。
 *
 * 用途：渲染层在上下文占比达到 80% 时，把较早的对话压成一段摘要。
 *
 * 关键隔离（与面板流式订阅互不影响）：
 * - **不经过 `claimChat`**：不登记 `activeChats`、不占面板的 `requestId`；
 * - **不向下发任何 `ai:chat:*` 事件**：只通过 invoke 的返回值交付文本；
 * - 内部复用能力层的 `streamChat` + collector 收 delta 拼串，不改任何 provider 适配器。
 *
 * 摘要输入是「已经超限的历史」，因此入参校验走 `readCompleteInput`（400 条上限），
 * 不能复用发送链路的 `readChatStartInput`（200 条）。
 */

const log = logger.scope('ai:complete')

/** 摘要补全超时（毫秒）：摘要可能较慢，给到 60 秒。 */
const COMPLETE_TIMEOUT_MS = 60_000

/** 补全结果：失败以 `ok=false` + 脱敏错误表达，不抛异常。 */
interface CompleteResult {
  ok: boolean
  text?: string
  usage?: AiUsage
  error?: AiError
}

/** 注册摘要补全 IPC。 */
export function registerAiCompleteIpc(): void {
  ipcMain.handle('ai:chat:complete', async (_event, input: unknown): Promise<CompleteResult> => {
    const parsed = readCompleteInput(input)
    if (!parsed) {
      log.warn('ai:chat:complete 入参非法')
      return {
        ok: false,
        error: { code: 'invalid_request', message: 'Invalid AI completion input' }
      }
    }

    const provider = parsed.provider ?? getAiConfig().provider
    // 独立 requestId：不占用面板的流式请求表，也不会被面板的 abort 命中。
    const requestId = randomUUID()
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, COMPLETE_TIMEOUT_MS)

    let text = ''
    let usage: AiUsage | undefined
    let failure: AiError | null = null

    log.debug('ai:chat:complete 开始', { provider, messages: parsed.messages.length })

    try {
      await streamChat(
        provider,
        parsed.messages,
        {
          requestId,
          timeoutMs: COMPLETE_TIMEOUT_MS,
          signal: controller.signal,
          ...(parsed.model !== undefined ? { model: parsed.model } : {}),
          ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {})
        },
        (event) => {
          if (event.type === 'delta') {
            text += event.delta
            return
          }
          if (event.type === 'done') {
            usage = event.usage
            return
          }
          failure = event.error
        }
      )
    } finally {
      clearTimeout(timer)
    }

    if (failure !== null) {
      const error: AiError = failure
      const code = timedOut ? 'timeout' : error.code
      log.warn('ai:chat:complete 失败', { provider, code, status: error.status })
      return {
        ok: false,
        error: {
          code,
          ...(error.status !== undefined ? { status: error.status } : {}),
          message: timedOut ? 'AI completion timed out' : error.message
        }
      }
    }

    const trimmed = text.trim()
    if (trimmed === '') {
      log.warn('ai:chat:complete 返回空文本', { provider })
      return { ok: false, error: { code: 'upstream', message: 'Empty AI completion' } }
    }

    log.debug('ai:chat:complete 完成', { provider, chars: trimmed.length })
    return usage === undefined ? { ok: true, text: trimmed } : { ok: true, text: trimmed, usage }
  })
}
