import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import { chatLog, loadSessionMessages } from './chatRuntime'
import type { ActiveRequest, AiConversationMessage } from './chatRuntime'
import type { SavedSummary } from './contextSummary'

export interface AiHistoryLoadInput {
  bookId: string
  /** 面板当前可见（页签 / 模块）。false 只中止在途请求，**不清空消息**。 */
  active: boolean
  /** 当前选中的会话；null = 新对话草稿（首次发送时创建）。 */
  sessionId: number | null
  /** 上一轮渲染的书 id（与 props 比对判断切书）。 */
  bookIdRef: RefObject<string>
  /** 当前指向的会话 id（发送路径会先行写入）。 */
  sessionIdRef: RefObject<number | null>
  /** `sessionIdRef` 所指会话归属的书。 */
  sessionBookRef: RefObject<string | null>
  /** 在途请求（载入期间已发起请求时不得用历史覆盖乐观消息）。 */
  activeRequestRef: RefObject<ActiveRequest | null>
  /** 消息当前所属的会话（null = 消息已清空 / 不属于任何会话）。 */
  loadedSessionRef: RefObject<number | null>
  applyMessages: (next: AiConversationMessage[]) => void
  applySummary: (next: SavedSummary | null) => void
  setNotice: (next: null) => void
  stopActive: (finalize: boolean) => void
}

/**
 * 会话 / 书籍 / 面板作用域切换时的历史载入（从 `useAiConversation` 拆出，见 AGENTS §3）。
 *
 * 作用域规则：
 * - 切书 / 切会话：中止在途请求（半截回复落库）→ 指向目标会话 → 清空旧消息 → 载入历史；
 * - **面板切走（`active=false`）只中止在途请求、保留消息**：页签 / 模块只是隐藏，
 *   回来时消息还在便直接复用；早退条件同时比对 `loadedSessionRef`，消息若已被清空
 *   （不再属于该会话）即便 `sessionId` 未变也会真正重载，不会出现「会话在而消息空」。
 * - 发送路径新建会话时已由 `ensureSession` 写入 `loadedSessionRef`，该次 prop 变化
 *   不会被误判成切换会话（避免中止刚启动的请求）。
 *
 * 返回值 = 历史加载中（已按面板可见性与会话有效性收口）。
 */
export function useAiHistoryLoad(input: AiHistoryLoadInput): boolean {
  const {
    bookId,
    active,
    sessionId,
    bookIdRef,
    sessionIdRef,
    sessionBookRef,
    activeRequestRef,
    loadedSessionRef,
    applyMessages,
    applySummary,
    setNotice,
    stopActive
  } = input
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // 只按「书」判断作用域：切章不重置（消息保留、在途请求不中止、会话不变）。
    const bookChanged = bookIdRef.current !== bookId

    // 面板切走：只中止在途请求，不清空消息（回来直接复用，不额外打历史 IPC）。
    if (!active && !bookChanged && sessionId === sessionIdRef.current) {
      stopActive(false)
      return undefined
    }

    // 会话由发送路径新建（ref 已先行指向该 id）：忽略这次 prop 变化，否则会中止刚启动的请求。
    // `loadedSessionRef` 兜底：消息已不属于该会话（被清空）时，即便 sessionId 未变也重载。
    if (
      !bookChanged &&
      active &&
      sessionId !== null &&
      sessionIdRef.current === sessionId &&
      loadedSessionRef.current === sessionId
    ) {
      return undefined
    }

    // 切书 / 切会话 / 返回面板且历史缺失：中止在途（半截回复落库）→ 指向目标 → 清空旧消息。
    stopActive(false)
    sessionIdRef.current = sessionId
    sessionBookRef.current = bookId
    loadedSessionRef.current = null
    applyMessages([])
    applySummary(null)
    setNotice(null)

    // 会话与章解耦：无选中章节时仍可载入当前会话历史。
    if (!active || sessionId === null) return undefined

    let cancelled = false

    void (async () => {
      setLoading(true)
      const api = window.api?.ai
      if (!api) {
        if (!cancelled) setLoading(false)
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
        loadedSessionRef.current = sessionId
        applySummary(loaded.summary)
        applyMessages(loaded.messages)
      } catch (error) {
        if (!cancelled) chatLog.warn('AI 会话载入失败', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    active,
    bookId,
    sessionId,
    bookIdRef,
    sessionIdRef,
    sessionBookRef,
    activeRequestRef,
    loadedSessionRef,
    applyMessages,
    applySummary,
    setNotice,
    stopActive
  ])

  return active && sessionId !== null && loading
}
