import type { WebContents } from 'electron'
import type { AiStreamEvent } from '../ai/types'
import { logger } from '../logger'

/**
 * 在途 AI 对话的生命周期（自 `ai.ts` 迁出）。
 *
 * 本文件是 `activeChats` 的唯一归属地：登记、释放、中止、窗口销毁清理与流式下发的
 * 全部读写都在此处完成，调用方只经函数入口操作，避免状态分散到多个文件。
 */

const log = logger.scope('ai')

/**
 * 在途请求表：键为 `${senderWebContentsId}:${requestId}`。
 *
 * 复合键避免多窗口用同一 `requestId` 相互覆盖；值为该请求的 AbortController。
 */
const activeChats = new Map<string, AbortController>()

/** 已挂过 `destroyed` 清理钩子的 webContents（WeakSet 保证每个 sender 只注册一次）。 */
const watchedSenders = new WeakSet<WebContents>()

function chatKey(senderId: number, requestId: string): string {
  return `${senderId}:${requestId}`
}

/** 仅当表内仍是本人（同一 controller）时才删除，防止误删同键的新请求。 */
function releaseChat(key: string, controller: AbortController): void {
  if (activeChats.get(key) === controller) activeChats.delete(key)
}

/**
 * 一次对话请求的租约：登记与释放的配对由本对象保证。
 * 调用方只持有此句柄，不直接接触 `activeChats` 的内部键值配对。
 */
export interface ChatLease {
  readonly key: string
  readonly controller: AbortController
  /** 释放租约（幂等：重复调用或身份不匹配时静默不删）。 */
  release(): void
}

/**
 * 登记一次在途对话并挂好 sender 销毁清理。
 *
 * 同一 sender 复用同一 `requestId` 视为「重启」：先中止旧请求，避免事件串流。
 * 返回的租约自带 `release()`，调用方无需自行配对 key / controller。
 */
export function claimChat(sender: WebContents, requestId: string): ChatLease {
  const key = chatKey(sender.id, requestId)

  activeChats.get(key)?.abort()
  if (activeChats.delete(key)) {
    log.warn('ai:chat:start 重复的 requestId，已中止旧请求', { requestId })
  }

  const controller = new AbortController()
  activeChats.set(key, controller)
  watchSenderLifecycle(sender)

  return {
    key,
    controller,
    release: () => releaseChat(key, controller)
  }
}

/** 中止指定 sender 名下的单个在途请求（`ai:chat:abort`）；表内无此请求返回 false。 */
export function abortChat(senderId: number, requestId: string): boolean {
  const key = chatKey(senderId, requestId)
  const controller = activeChats.get(key)
  if (!controller) return false

  activeChats.delete(key)
  controller.abort()
  log.debug('ai:chat:abort', { requestId })
  return true
}

/** 中止某 webContents 名下的全部在途请求（窗口关闭 / 页面卸载时调用）。 */
function abortChatsOfSender(senderId: number): void {
  const prefix = `${senderId}:`
  let aborted = 0
  for (const [key, controller] of activeChats) {
    if (!key.startsWith(prefix)) continue
    activeChats.delete(key)
    controller.abort()
    aborted += 1
  }
  if (aborted > 0) log.debug('已中止窗口名下在途对话', { senderId, aborted })
}

/**
 * 为 sender 注册一次性销毁清理（幂等）。
 *
 * `senderId` 必须在注册时先取好：webContents 销毁后再读 `id` 可能抛错。
 */
function watchSenderLifecycle(sender: WebContents): void {
  if (watchedSenders.has(sender)) return
  watchedSenders.add(sender)
  const senderId = sender.id
  sender.once('destroyed', () => {
    watchedSenders.delete(sender)
    abortChatsOfSender(senderId)
  })
}

/** 单向下发流式事件；sender 已销毁时静默丢弃（避免 `send` 抛错）。 */
export function sendStreamEvent(sender: WebContents, event: AiStreamEvent): void {
  if (sender.isDestroyed()) return
  switch (event.type) {
    case 'delta':
      sender.send('ai:chat:delta', { requestId: event.requestId, delta: event.delta })
      break
    case 'done':
      sender.send(
        'ai:chat:done',
        event.usage === undefined
          ? { requestId: event.requestId }
          : { requestId: event.requestId, usage: event.usage }
      )
      break
    case 'error':
      sender.send('ai:chat:error', { requestId: event.requestId, error: event.error })
      break
  }
}
