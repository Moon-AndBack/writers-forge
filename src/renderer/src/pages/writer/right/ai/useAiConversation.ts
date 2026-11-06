import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiError, AiProviderId, AiUsage } from '../../../../../../preload/types/ai'
import {
  appendMessage,
  chatLog,
  createActiveRequest,
  createOptimisticMessages,
  insertCompactionDivider,
  loadSessionMessages,
  persistAssistantPartial,
  readCompressionEnabled,
  UNKNOWN_ERROR
} from './chatRuntime'
import type {
  ActiveRequest,
  AiContextNotice,
  AiConversationMessage,
  AiConversationState,
  EnsuredSession
} from './chatRuntime'
import { autoTitleSession } from './aiSessionTitle'
import { composeMessages, type AiComposeInput } from './functions'
import { encodeSummaryRow, prepareOutgoingMessages } from './contextSummary'
import type { SavedSummary } from './contextSummary'
import { estimateMessages, recordCalibration } from './contextBudget'
import { resolveContextLimit } from './useContextUsage'

export type { AiConversationMessage, AiConversationState }

/**
 * 章节右栏 AI · 会话 + 消息 + 流式状态机（统一输入区口径）。
 *
 * 会话由 `useAiSessions` 选中后经 `sessionId` 传入（默认仍是该书最近一条）；
 * `sessionId` / 书籍变化时中止在途请求（半截回复落库）→ 清空消息 → 重载历史。
 * 会话按书归属、与章解耦：**切章既不清空消息也不中止在途请求**，会话保持不变；
 * 消息落库时记录**发起时**所在的章，供回插校验（无章聊天为 null）。
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
  /** 新建会话被自动命名后回传（仅刷新列表，不改变当前选中）。 */
  onSessionTitled?: () => void
}): AiConversationState {
  const { bookId, chapterId, active, model, sessionId, onSessionCreated, onSessionTitled } = input

  const [messages, setMessages] = useState<AiConversationMessage[]>([])
  const [generating, setGenerating] = useState(false)
  const [compressing, setCompressing] = useState(false)
  const [hydrating, setHydrating] = useState(false)
  const [summary, setSummary] = useState<SavedSummary | null>(null)
  const [notice, setNotice] = useState<AiContextNotice | null>(null)

  /** 消息的同步副本：流式回调 / 发送路径都读它，避免闭包拿到过期的 state。 */
  const messagesRef = useRef<AiConversationMessage[]>([])
  const sessionIdRef = useRef<number | null>(null)
  /** `sessionIdRef` 里那条会话归属的书（切书后据此丢弃旧书会话，见 `ensureSession`）。 */
  const sessionBookRef = useRef<string | null>(null)
  /** 当前会话摘要的同步副本（发送路径在异步分支里读）。 */
  const summaryRef = useRef<SavedSummary | null>(null)
  const providerRef = useRef<AiProviderId>('deepseek')
  const modelRef = useRef(model)
  const bookIdRef = useRef(bookId)
  const chapterIdRef = useRef<number | null>(chapterId)
  const activeRequestRef = useRef<ActiveRequest | null>(null)
  /** 会话回调走 ref：异步路径 / 流式回调里读最新值，且不拖累 effect 依赖。 */
  const sessionCallbacksRef = useRef({ onSessionCreated, onSessionTitled })

  // 模型快照：发送 / 建会话都在异步路径里读，用 ref 取最新值。
  useEffect(() => {
    modelRef.current = model
  }, [model])

  useEffect(() => {
    sessionCallbacksRef.current = { onSessionCreated, onSessionTitled }
  }, [onSessionCreated, onSessionTitled])

  /* ---------- 消息写入（同步副本 + state 双写） ---------- */

  const applyMessages = useCallback((next: AiConversationMessage[]): void => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const applySummary = useCallback((next: SavedSummary | null): void => {
    summaryRef.current = next
    setSummary(next)
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

  /** 确保当前书有会话（会话按书归属，与章无关；已有则直接复用）。 */
  const ensureSession = useCallback(async (): Promise<EnsuredSession> => {
    const book = bookIdRef.current
    // 只复用「同一本书」的会话：切书后旧 id 必须丢弃，切章则不受影响。
    if (sessionIdRef.current !== null && sessionBookRef.current === book) {
      return { id: sessionIdRef.current, created: false }
    }
    const api = window.api?.ai
    if (!api) return { id: null, created: false }
    const provider = await resolveProvider()

    try {
      const created = await api.sessions.create({
        bookId: book,
        provider,
        model: modelRef.current
      })
      const id = created?.id ?? null
      sessionIdRef.current = id
      sessionBookRef.current = book
      if (id !== null) sessionCallbacksRef.current.onSessionCreated?.(id)
      return { id, created: id !== null }
    } catch (error) {
      chatLog.warn('AI 会话创建失败', error)
      return { id: null, created: false }
    }
  }, [resolveProvider])

  /* ---------- 中止 ---------- */

  /**
   * 中止在途请求并摘下它（迟到事件随之被过滤）；`finalize` 为 true 时把流式产物定稿。
   *
   * 无论中止原因（用户点停止 / 切会话 / 切书 / 卸载），已生成的半截回复都落库，
   * 不再静默丢弃（`persistAssistantPartial`）。
   *
   * 状态语义：这里是**本地主动停止**，不是上游异常，落库状态保持 `done`——内容就是模型
   * 已完整产出到此为止的部分，可以正常回插/续用；需要提示「未走完」的只有上游报错中断。
   */
  const stopActive = useCallback(
    (finalize: boolean): void => {
      const request = activeRequestRef.current
      if (request === null) return

      // 先摘掉在途请求：之后的迟到事件（含 aborted 错误）一律被 requestId 过滤丢弃。
      activeRequestRef.current = null
      setGenerating(false)
      setCompressing(false)
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
      setCompressing(false)

      // 估算校准：真实 prompt_tokens / 本次估算 → 按 provider/model 记 EMA（仅内存）。
      const actualPromptTokens = usage?.promptTokens
      if (
        request.calibrationKey !== '' &&
        request.estimatedPromptTokens > 0 &&
        actualPromptTokens !== undefined
      ) {
        recordCalibration(request.calibrationKey, request.estimatedPromptTokens, actualPromptTokens)
      }

      patchMessage(request.assistantId, { streaming: false, content: request.content })
      // 所有功能的完整回复都落库（用户消息已在发送时写入）；正常完成即默认状态 `done`。
      persistAssistantPartial(request, { usage })
      autoTitleSession(request, sessionCallbacksRef.current.onSessionTitled)
    },
    [patchMessage]
  )

  const handleError = useCallback(
    (request: ActiveRequest, error: AiError): void => {
      activeRequestRef.current = null
      setGenerating(false)
      setCompressing(false)
      patchMessage(request.assistantId, { streaming: false, error, interrupted: true })
      // 报错同样算「没走完」：已生成的半截回复仍落库，状态记为 `interrupted`，
      // 由气泡按状态渲染结构化标记（不进正文，避免污染回插与后续上下文）。
      persistAssistantPartial(request, { status: 'interrupted' })
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
      setCompressing(false)
      if (request !== null) {
        persistAssistantPartial(request)
        void api.chat.abort(request.requestId).catch(() => undefined)
      }
    }
  }, [handleDelta, handleDone, handleError])

  /* ---------- 发送 ---------- */

  const send = useCallback(
    (compose: AiComposeInput): Promise<boolean> => {
      // 同一时刻只允许一个请求（UI 也会按 generating / compressing 禁用）。
      if (activeRequestRef.current !== null) return Promise.resolve(false)
      const api = window.api?.ai
      if (!api) return Promise.resolve(false)

      // system + user 两条（输入与上下文都为空时为空数组 → 直接忽略）。
      const composed = composeMessages(compose)
      if (composed.length === 0) return Promise.resolve(false)

      // 自由对话带历史（不含空内容消息；报错中断的半截回复仍带上——它是模型自己的产出，
      // 丢掉会断掉多轮连贯性，界面已另行标注「因错误中断」，system 不落库）。
      const history: AiConversationMessage[] =
        compose.action === 'chat'
          ? messagesRef.current.filter(
              (m) => m.content.trim() !== '' && (m.interrupted === true || m.error === undefined)
            )
          : []

      const request = createActiveRequest({
        sessionId: sessionIdRef.current,
        chapterId: chapterIdRef.current,
        action: compose.action
      })
      activeRequestRef.current = request
      setNotice(null)
      setGenerating(true)
      setCompressing(false)
      const baseMessages = messagesRef.current
      // user 气泡只在有展示文本时出现：输入为空时退回面板给的 `display`（如「[润色] 整章正文」），
      // 让「只勾上下文」的轮次在历史里也看得出做了什么；`display` 不进模型消息。
      const userText = compose.input.trim() || compose.display?.trim() || ''
      applyMessages(
        createOptimisticMessages({
          base: baseMessages,
          userText,
          assistantId: request.assistantId,
          chapterId: request.chapterId,
          action: compose.action
        })
      )
      /** 超预算拒绝：撤掉本轮乐观消息、恢复输入（由调用方按 false 处理）。 */
      const reject = (usedTokens: number, limitTokens: number): false => {
        if (activeRequestRef.current === request) {
          activeRequestRef.current = null
          setGenerating(false)
          setCompressing(false)
          setNotice({ usedTokens, limitTokens })
          applyMessages(baseMessages)
        }
        return false
      }

      return (async (): Promise<boolean> => {
        // 所有请求都要落库，故先确保会话（同时供 opencode 的 x-opencode-session 头）。
        const ensured = await ensureSession()
        // 等待期间被中止 / 切书 / 卸载：放弃本次启动（调用方恢复输入）。
        if (activeRequestRef.current !== request) return false
        const sessionId = ensured.id
        request.sessionId = sessionId

        try {
          const provider = await resolveProvider()
          if (activeRequestRef.current !== request) return false
          const modelId = modelRef.current.trim()

          if (ensured.created && sessionId !== null) {
            request.autoTitle = { provider, model: modelId, firstUserText: userText }
          }

          // 发送前判定：固定部分超窗口 → 拒绝；达 80% → 摘要 / 截断。
          const limitTokens = (await resolveContextLimit(modelId)).tokens
          if (activeRequestRef.current !== request) return false

          // 设置页「启用自动压缩」：关闭时仍截断 / 拒绝，但不额外发摘要请求。
          const compress = await readCompressionEnabled()
          if (activeRequestRef.current !== request) return false

          if (compose.action === 'chat') setCompressing(true)
          const prepared = await prepareOutgoingMessages({
            composed,
            history,
            summary: compose.action === 'chat' ? summaryRef.current : null,
            limitTokens,
            provider,
            model: modelId,
            compress,
            persistSummary: async (covered, text) => {
              if (sessionId === null) return null
              await appendMessage(sessionId, 'system', encodeSummaryRow(covered, text), {
                chapterId: request.chapterId
              })
              return { id: 0, content: text, covered }
            }
          })
          if (activeRequestRef.current !== request) return false
          setCompressing(false)

          if (!prepared.ok) {
            return reject(prepared.usedTokens, prepared.limitTokens)
          }

          // 校准分母：本次实际发出的消息估算值随请求保存，done 时与真实 prompt_tokens 比对。
          request.estimatedPromptTokens = estimateMessages(prepared.messages)
          if (modelId !== '') request.calibrationKey = `${provider}/${modelId}`

          if (compose.action === 'chat' && prepared.summary) {
            applySummary(prepared.summary)
          }
          if (prepared.divider?.kind === 'compacted') {
            const covered = prepared.summary?.covered ?? summaryRef.current?.covered ?? 0
            applyMessages(insertCompactionDivider(messagesRef.current, covered, prepared.divider))
          }

          if (sessionId !== null && userText !== '') {
            void appendMessage(sessionId, 'user', userText, {
              chapterId: request.chapterId,
              action: compose.action
            })
          }

          await api.chat.start({
            requestId: request.requestId,
            messages: prepared.messages,
            ...(sessionId !== null ? { sessionId: String(sessionId) } : {}),
            provider,
            ...(modelId !== '' ? { model: modelId } : {})
          })
          return true
        } catch (error) {
          if (activeRequestRef.current !== request) return true
          chatLog.warn('AI 请求启动失败', error)
          handleError(request, UNKNOWN_ERROR)
          return true
        } finally {
          // 压缩 / 启动阶段任何退出（抛错、提前 return、拒绝、正常）都复位，避免 UI 卡在「整理中」。
          setCompressing(false)
        }
      })()
    },
    [applyMessages, applySummary, ensureSession, handleError, resolveProvider]
  )

  const abort = useCallback((): void => {
    stopActive(true)
  }, [stopActive])

  /* ---------- 章节 / 会话 / 面板切换：清空 + 载入历史 ---------- */

  useEffect(() => {
    // 只按「书」判断作用域：切章不重置（消息保留、在途请求不中止、会话不变）。
    const bookChanged = bookIdRef.current !== bookId
    // 会话由本 hook 的 send 路径新建（内部 ref 已指向该 id）：忽略这次 prop 变化，
    // 否则会在请求刚启动时把在途请求中止掉。其余变化（切换 / 删除 / 新建草稿）都重载。
    if (!bookChanged && active && sessionId !== null && sessionIdRef.current === sessionId) {
      return undefined
    }

    // 切书 / 切会话 / 开关面板：中止在途请求（半截回复落库）→ 指向目标会话 → 清空消息。
    stopActive(false)
    sessionIdRef.current = sessionId
    sessionBookRef.current = bookId
    applyMessages([])
    applySummary(null)
    setNotice(null)

    // 会话与章解耦：无选中章节时仍可载入当前会话历史。
    if (!active || sessionId === null) {
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
        const loaded = await loadSessionMessages({
          api,
          sessionId,
          isCancelled: () => cancelled
        })
        if (cancelled || loaded === null) return
        // 载入期间用户已发起新请求（乐观消息已在界面上）：不用历史覆盖，避免丢失流式占位。
        if (activeRequestRef.current !== null) return
        applySummary(loaded.summary)
        applyMessages(loaded.messages)
      } catch (error) {
        if (!cancelled) chatLog.warn('AI 会话载入失败', error)
      } finally {
        if (!cancelled) setHydrating(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, bookId, sessionId, applyMessages, applySummary, stopActive])

  // ref 同步（无副作用）。必须在主 effect 之后：否则切书时 ref 已被写成新值，
  // 主 effect 会把 `bookChanged` 误判为 false。切章只更新章快照，不影响消息与请求。
  useEffect(() => {
    bookIdRef.current = bookId
    chapterIdRef.current = chapterId
  }, [bookId, chapterId])

  return {
    messages,
    generating,
    compressing,
    hydrating: active && sessionId !== null && hydrating,
    summary,
    notice,
    send,
    abort
  }
}
