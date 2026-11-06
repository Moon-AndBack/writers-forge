import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AiChatSessionRow } from '../../../../../../preload/types/ai'
import { chatLog } from './chatRuntime'

/** 会话列表状态（按书作用域隔离；切章不影响会话列表）。 */
interface SessionScope {
  key: string
  list: AiChatSessionRow[]
  activeId: number | null
}

export interface AiSessionsState {
  /** 当前书的全部会话（最近活跃倒序）。 */
  sessions: AiChatSessionRow[]
  /** 当前选中的会话；null = 新对话草稿（首次发送时才创建）。 */
  activeSessionId: number | null
  /** 是否正在拉取会话列表。 */
  loading: boolean
  /** 重载列表；`preferId` 优先作为当前选中（新建会话后使用）。 */
  refresh: (preferId?: number) => Promise<void>
  /** 切换会话（null = 新对话草稿）。 */
  select: (id: number | null) => void
  /** 新建会话落库后调用：切到该条并刷新列表。 */
  notifyCreated: (id: number) => void
  /** 重命名，成功返回 true（失败保持原状）。 */
  rename: (id: number, title: string) => Promise<boolean>
  /** 删除；成功返回 true（激活中的会话被删后自动切到最近一条）。 */
  remove: (id: number) => Promise<boolean>
}

/**
 * 章节右栏 AI · 会话列表与当前选中。
 *
 * 会话按书归属（与章解耦）：默认行为保持「打开该书最近一条会话」
 * （`listAiSessions` 已按 `updated_at DESC, id DESC` 排序，取第一条）；
 * 此外提供切换 / 新建（草稿）/ 重命名 / 删除。切章不改变会话作用域。
 *
 * 作用域用 `key`（书 id）标记：切书时 `state.key` 与当前 key 不一致，对外立即表现为
 * 「空列表 + 无选中」，避免把上一本书的会话 id 传给对话 hook 误载入。
 */
export function useAiSessions(input: {
  bookId: string
  /** 已不参与会话作用域（会话按书归属）；保留入参兼容现有调用方，下一批移除。 */
  chapterId: number | null
  active: boolean
}): AiSessionsState {
  const { bookId, active } = input
  const key = bookId

  const [state, setState] = useState<SessionScope>({ key: '', list: [], activeId: null })
  const [loading, setLoading] = useState(false)
  /** 当前作用域 key（异步 refresh 回来时对照，丢弃切书前的过期结果）。 */
  const scopeKeyRef = useRef(key)

  useEffect(() => {
    scopeKeyRef.current = key
  }, [key])

  /** 对外作用域：key 不匹配（切书）时一律为空，直到新列表返回。 */
  const scoped = useMemo<SessionScope>(
    () => (state.key === key ? state : { key, list: [], activeId: null }),
    [state, key]
  )

  const refresh = useCallback(
    async (preferId?: number): Promise<void> => {
      const api = window.api?.ai
      if (!api) return

      const scopeKey = bookId
      try {
        const list = await api.sessions.list(bookId)
        setState((prev) => {
          // 切书后才回来的旧请求：不写回，避免把新书的列表状态覆盖成旧书。
          if (scopeKeyRef.current !== scopeKey) return prev
          const sameScope = prev.key === scopeKey
          // preferId 只在「新作用域」或「当前已是该条」时采纳：避免迟到的创建刷新
          // 把用户随后手动切到的会话 / 新建草稿抢回去。
          const preferred =
            preferId !== undefined && (!sameScope || prev.activeId === preferId)
              ? preferId
              : sameScope
                ? prev.activeId
                : null
          const keep = preferred !== null && list.some((row) => row.id === preferred)
          // 已选会话仍在 → 保持；草稿（同作用域 null）→ 仍是草稿；
          // 被删 / 新作用域 → 最近一条。
          const activeId = keep
            ? preferred
            : preferred === null && sameScope
              ? null
              : (list[0]?.id ?? null)
          return { key: scopeKey, list, activeId }
        })
      } catch (error) {
        chatLog.warn('AI 会话列表读取失败', error)
      }
    },
    [bookId]
  )

  // 打开面板 / 切书：拉一次列表（默认选中最近一条）；切章不重拉。
  useEffect(() => {
    if (!active) return
    let cancelled = false

    // 异步 IIFE：加载态的 setState 不放在 effect 同步段（避免级联渲染告警）。
    void (async () => {
      setLoading(true)
      try {
        const api = window.api?.ai
        if (!api) return
        const list = await api.sessions.list(bookId)
        if (cancelled) return
        setState((prev) => {
          const preferred = prev.key === key ? prev.activeId : null
          const keep = preferred !== null && list.some((row) => row.id === preferred)
          return { key, list, activeId: keep ? preferred : (list[0]?.id ?? null) }
        })
      } catch (error) {
        if (!cancelled) chatLog.warn('AI 会话列表读取失败', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, bookId, key])

  const select = useCallback(
    (id: number | null): void => {
      setState((prev) => (prev.key === key ? { ...prev, activeId: id } : prev))
    },
    [key]
  )

  const notifyCreated = useCallback(
    (id: number): void => {
      setState((prev) => (prev.key === key ? { ...prev, activeId: id } : prev))
      void refresh(id)
    },
    [key, refresh]
  )

  const rename = useCallback(
    async (id: number, title: string): Promise<boolean> => {
      const api = window.api?.ai
      if (!api) return false
      try {
        const ok = await api.sessions.rename(id, title)
        if (ok) await refresh()
        return ok
      } catch (error) {
        chatLog.warn('AI 会话重命名失败', error)
        return false
      }
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: number): Promise<boolean> => {
      const api = window.api?.ai
      if (!api) return false
      try {
        const ok = await api.sessions.delete(id)
        if (ok) await refresh()
        return ok
      } catch (error) {
        chatLog.warn('AI 会话删除失败', error)
        return false
      }
    },
    [refresh]
  )

  return {
    sessions: scoped.list,
    activeSessionId: scoped.activeId,
    // 切书时 state.key 尚未跟上：对外仍算加载中，避免空态文案闪一下。
    loading: active && (state.key !== key || loading),
    refresh,
    select,
    notifyCreated,
    rename,
    remove
  }
}
