import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  AiChatMessage,
  AiError,
  AiProviderId,
  AiUsage
} from '../../../../../../preload/types/ai'
import {
  appendMessage,
  chatLog,
  createLocalId,
  createRequestId,
  loadSessionMessages,
  persistAssistantPartial,
  UNKNOWN_ERROR
} from './chatRuntime'
import type { ActiveRequest, AiConversationMessage, AiConversationState } from './chatRuntime'
import { composeMessages, type AiComposeInput } from './functions'

export type { AiConversationMessage, AiConversationState }

/**
 * 章节右栏 AI · 会话 + 消息 + 流式状态机（统一输入区口径）。
 *
 * 会话由 `useAiSessions` 选中后经 `sessionId` 传入（默认仍是该章最近一条）；
 * `chapterId` / `sessionId` 变化时中止在途请求（半截回复落库）→ 清空消息 → 重载历史。
 * **所有请求（润色 / 续写 / 改写 / 翻译 / 自由对话）**
 * 走同一条 `send`：消息进对话列表并落库，流式事件按 `requestId` 过滤。
 *
 * 请求组装交给 `composeMessages`（system + user）；自由对话额外带历史消息，
 * 快捷功能只发「system + 本次 user」（避免历史回复干扰一次性改写口径）。
 */
export function useAiConversation(input: {
  bookId: string
  chapterId: number | null
  active: boolean
  model: string
  /** 当前选中的会话；null = 新对话草稿（首次发送时创建）。 */
  sessionId: number | null
  /** 新会话创建成功后回传（用于刷新会话列表并切到该条）。 */
  onSessionCreated?: (id: number) => void
}): AiConversationState {
  const { bookId, chapterId, active, model, sessionId, onSessionCreated } = input
  const { t } = useTranslation('ai')

  const [messages, setMessages] = useState<AiConversationMessage[]>([])
  const [generating, setGenerating] = useState(false)
  const [hydrating, setHydrating] = useState(false)

  /** 消息的同步副本：流式回调 / 发送路径都读它，避免闭包拿到过期的 state。 */
  const messagesRef = useRef<AiConversationMessage[]>([])
  const sessionIdRef = useRef<number | null>(null)
  const providerRef = useRef<AiProviderId>('deepseek')
  const modelRef = useRef(model)
  const bookIdRef = useRef(bookId)
  const chapterIdRef = useRef<number | null>(chapterId)
  const activeRequestRef = useRef<ActiveRequest | null>(null)
  /** 会话创建回调走 ref：send / ensureSession 在异步路径里读最新值，且不拖累依赖。 */
  const onSessionCreatedRef = useRef(onSessionCreated)

  // 模型快照：发送 / 建会话都在异步路径里读，用 ref 取最新值。
  useEffect(() => {
    modelRef.current = model
  }, [model])

  useEffect(() => {
    onSessionCreatedRef.current = onSessionCreated
  }, [onSessionCreated])

  /**
   * 中断说明后缀（`\n\n> 文案`，markdown 引用块，重新载入后仍可见）。
   *
   * 用 ref 存最新译文而非让 `handleError` 依赖 `t`：否则切语言会改变回调标识，
   * 进而重挂流式订阅——重挂的清理会顺带中止在途请求。
   */
  const interruptedSuffixRef = useRef('')
  useEffect(() => {
    interruptedSuffixRef.current = `\n\n> ${t('message.interrupted')}`
  }, [t])

  /* ---------- 消息写入（同步副本 + state 双写） ---------- */

  const applyMessages = useCallback((next: AiConversationMessage[]): void => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const patchMessage = useCallback(
    (id: string, patch: Partial<AiConversationMessage>): void => {
      applyMessages(messagesRef.current.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    },
    [applyMessages]
  )

  const appendDelta = useCallback(
    (id: string, delta: string): void => {
      applyMessages(
        messagesRef.current.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m))
      )
    },
    [applyMessages]
  )

  /* ---------- 配置 / 会话 ---------- */

  /** 读取当前服务商（失败回退到上一次读到的值）。 */
  const resolveProvider = useCallback(async (): Promise<AiProviderId> => {
    const api = window.api?.ai
    if (!api) return providerRef.current
    try {
      const config = await api.config.get()
      providerRef.current = config.provider
      return config.provider
    } catch (error) {
      chatLog.warn('AI 配置读取失败，沿用上次服务商', error)
      return providerRef.current
    }
  }, [])

  /** 确保当前章节有会话（已有则直接复用）。 */
  const ensureSession = useCallback(async (): Promise<number | null> => {
    if (sessionIdRef.current !== null) return sessionIdRef.current
    const chapter = chapterIdRef.current
    const api = window.api?.ai
    if (chapter === null || !api) return null
    const book = bookIdRef.current
    const provider = await resolveProvider()

    try {
      const created = await api.sessions.create({
        bookId: book,
        chapterId: chapter,
        provider,
        model: modelRef.current
      })
      // 建会话期间已切章：不采纳这条过期会话（列表里留空会话，无害）。
      if (chapterIdRef.current !== chapter) return null
      const id = created?.id ?? null
      sessionIdRef.current = id
      if (id !== null) onSessionCreatedRef.current?.(id)
      return id
    } catch (error) {
      chatLog.warn('AI 会话创建失败', error)
      return null
    }
  }, [resolveProvider])

  /* ---------- 中止 ---------- */

  /**
   * 中止在途请求并摘下它（迟到事件随之被过滤）；`finalize` 为 true 时把流式产物定稿。
   *
   * 无论中止原因（用户点停止 / 切会话 / 切章 / 卸载），已生成的半截回复都落库，
   * 不再静默丢弃（`persistAssistantPartial`）。
   */
  const stopActive = useCallback(
    (finalize: boolean): void => {
      const request = activeRequestRef.current
      if (request === null) return

      // 先摘掉在途请求：之后的迟到事件（含 aborted 错误）一律被 requestId 过滤丢弃。
      activeRequestRef.current = null
      setGenerating(false)
      persistAssistantPartial(request)

      const api = window.api?.ai
      if (api) void api.chat.abort(request.requestId).catch(() => undefined)

      if (finalize) patchMessage(request.assistantId, { streaming: false })
    },
    [patchMessage]
  )

  /* ---------- 流式事件 ---------- */

  const handleDelta = useCallback(
    (request: ActiveRequest, delta: string): void => {
      request.content += delta
      appendDelta(request.assistantId, delta)
    },
    [appendDelta]
  )

  const handleDone = useCallback(
    (request: ActiveRequest, usage?: AiUsage): void => {
      activeRequestRef.current = null
      setGenerating(false)

      patchMessage(request.assistantId, { streaming: false, content: request.content })
      // 所有功能的完整回复都落库（用户消息已在发送时写入）。
      persistAssistantPartial(request, { usage })
    },
    [patchMessage]
  )

  const handleError = useCallback(
    (request: ActiveRequest, error: AiError): void => {
      activeRequestRef.current = null
      setGenerating(false)
      patchMessage(request.assistantId, { streaming: false, error })
      // 报错同样算「没走完」：已生成的半截回复仍落库，并在末尾标记中断，
      // 不让它比用户主动停止的回复少一截（去重由 `persisted` 保证）。
      persistAssistantPartial(request, { suffix: interruptedSuffixRef.current })
    },
    [patchMessage]
  )

  // 订阅在挂载时挂一次；回调内按 requestId 过滤（onStream 是全局广播，别的面板 / 已中止
  // 请求的事件都会进来）。清理时一并中止在途请求（卸载 / 重挂不留悬挂请求）。
  useEffect(() => {
    const api = window.api?.ai
    if (!api) return undefined

    const unsubscribe = api.chat.onStream((event) => {
      const request = activeRequestRef.current
      if (request === null || event.requestId !== request.requestId) return

      if (event.type === 'delta') {
        handleDelta(request, event.delta)
        return
      }
      if (event.type === 'done') {
        handleDone(request, event.usage)
        return
      }
      handleError(request, event.error)
    })

    return () => {
      unsubscribe()
      const request = activeRequestRef.current
      activeRequestRef.current = null
      if (request !== null) {
        persistAssistantPartial(request)
        void api.chat.abort(request.requestId).catch(() => undefined)
      }
    }
  }, [handleDelta, handleDone, handleError])

  /* ---------- 发送 ---------- */

  const send = useCallback(
    (compose: AiComposeInput): void => {
      // 同一时刻只允许一个请求（UI 也会按 generating 禁用）。
      if (activeRequestRef.current !== null) return
      const api = window.api?.ai
      if (!api) return

      // system + user 两条（输入与上下文都为空时为空数组 → 直接忽略）。
      const composed = composeMessages(compose)
      if (composed.length === 0) return

      // 自由对话带历史（不含失败 / 空内容消息，system 不落库）；快捷功能只发本次要求。
      const history: AiChatMessage[] =
        compose.action === 'chat'
          ? messagesRef.current
              .filter((m) => m.error === undefined && m.content.trim() !== '')
              .map((m): AiChatMessage => ({ role: m.role, content: m.content }))
          : []
      const requestMessages: AiChatMessage[] = [composed[0], ...history, ...composed.slice(1)]

      const requestId = createRequestId()
      const assistantId = createLocalId('assistant')
      const request: ActiveRequest = {
        requestId,
        assistantId,
        content: '',
        sessionId: sessionIdRef.current
      }
      activeRequestRef.current = request
      setGenerating(true)

      // user 气泡只在有展示文本时出现：输入为空时退回面板给的 `display`（如「[润色] 整章正文」），
      // 让「只勾上下文」的轮次在历史里也看得出做了什么；`display` 不进模型消息。
      const userText = compose.input.trim() || compose.display?.trim() || ''
      applyMessages([
        ...messagesRef.current,
        ...(userText !== ''
          ? [{ id: createLocalId('user'), role: 'user' as const, content: userText }]
          : []),
        { id: assistantId, role: 'assistant' as const, content: '', streaming: true }
      ])

      void (async () => {
        // 所有请求都要落库，故先确保会话（同时供 opencode 的 x-opencode-session 头）。
        const sessionId = await ensureSession()
        // 等待期间被中止 / 切章 / 卸载：放弃本次启动。
        if (activeRequestRef.current !== request) return
        request.sessionId = sessionId

        if (sessionId !== null && userText !== '') {
          void appendMessage(sessionId, 'user', userText)
        }

        try {
          const provider = await resolveProvider()
          if (activeRequestRef.current !== request) return
          const modelId = modelRef.current.trim()
          await api.chat.start({
            requestId,
            messages: requestMessages,
            ...(sessionId !== null ? { sessionId: String(sessionId) } : {}),
            provider,
            ...(modelId !== '' ? { model: modelId } : {})
          })
        } catch (error) {
          if (activeRequestRef.current !== request) return
          chatLog.warn('AI 请求启动失败', error)
          handleError(request, UNKNOWN_ERROR)
        }
      })()
    },
    [applyMessages, ensureSession, handleError, resolveProvider]
  )

  const abort = useCallback((): void => {
    stopActive(true)
  }, [stopActive])

  /* ---------- 章节 / 会话 / 面板切换：清空 + 载入历史 ---------- */

  useEffect(() => {
    const chapterChanged = bookIdRef.current !== bookId || chapterIdRef.current !== chapterId
    bookIdRef.current = bookId
    chapterIdRef.current = chapterId

    // 会话由本 hook 的 send 路径新建（内部 ref 已指向该 id）：忽略这次 prop 变化，
    // 否则会在请求刚启动时把在途请求中止掉。其余变化（切换 / 删除 / 新建草稿）都重载。
    if (!chapterChanged && active && sessionId !== null && sessionIdRef.current === sessionId) {
      return undefined
    }

    // 切章 / 切会话 / 开关面板的清理序列：中止在途请求（半截回复落库）→
    // 同步指向目标会话 → 清空消息。同步执行，避免闪一帧旧内容。
    stopActive(false)
    sessionIdRef.current = sessionId
    applyMessages([])

    if (!active || chapterId === null || sessionId === null) {
      return undefined
    }

    let cancelled = false

    void (async () => {
      setHydrating(true)
      const api = window.api?.ai
      if (!api) {
        if (!cancelled) setHydrating(false)
        return
      }

      try {
        const history = await loadSessionMessages({
          api,
          sessionId,
          isCancelled: () => cancelled
        })
        if (cancelled || history === null) return
        // 载入期间用户已发起新请求（乐观消息已在界面上）：不用历史覆盖，避免丢失流式占位。
        if (activeRequestRef.current !== null) return
        applyMessages(history)
      } catch (error) {
        if (!cancelled) chatLog.warn('AI 会话载入失败', error)
      } finally {
        if (!cancelled) setHydrating(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, bookId, chapterId, sessionId, applyMessages, stopActive])

  return { messages, generating, hydrating: active && sessionId !== null && hydrating, send, abort }
}
