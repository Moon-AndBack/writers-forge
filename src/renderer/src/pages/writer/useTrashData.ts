/**
 * 章节 / 大纲回收站共用的数据 hook（§9 唯一实现）。
 *
 * 覆盖两套实现逐字相同的部分：初始 / `bookId` 变化加载（含 `active` 守卫与卸载清理）、
 * 写操作后的刷新、`busy` 门禁与失败日志。域差异（API 命名空间、名称解析、确认文案、
 * 伏笔 target）全部留在各自视图。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import { subscribeTrashChanged } from './trashRefresh'

/** 回收站数据 hook 的入参。 */
export interface UseTrashDataOptions<T> {
  /** 书籍 id（路由参数）；变化时重新加载。 */
  bookId: string
  /** 首帧内容（空回收站常量）；`useState` 只在首次渲染取值。 */
  initial: T
  /** 拉取回收站内容（纯异步、无 setState）；`bookId` 为空时应返回 `initial`。 */
  load: (bookId: string) => Promise<T>
  /** 写操作成功后回调（页面据此刷新章节树 / 大纲树）。 */
  onChanged: () => void
  /** 日志作用域（`createLogger` 名）。 */
  logger: string
}

/** 回收站数据 hook 的返回值。 */
export interface UseTrashDataResult<T> {
  /** 当前回收站内容。 */
  content: T
  /** 首帧加载中（仅用于抑制空态闪现）。 */
  loading: boolean
  /** 写操作进行中（按钮禁用 + 操作门禁）。 */
  busy: boolean
  /** 执行一次写操作：成功后**先刷新本视图、再**通知调用方。 */
  runAction: (action: () => Promise<unknown>) => Promise<void>
  /** 重新拉取回收站内容（写操作后刷新，亦可手动调用）。 */
  reload: () => Promise<void>
}

export function useTrashData<T>({
  bookId,
  initial,
  load,
  onChanged,
  logger
}: UseTrashDataOptions<T>): UseTrashDataResult<T> {
  const [content, setContent] = useState<T>(initial)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const log = useMemo(() => createLogger(logger), [logger])

  // `load` / `onChanged` 以 ref 持有最新实现（在 effect 内更新，避免渲染期写 ref）：
  // 调用方常内联传参（每次渲染换引用），直接进依赖会让加载 effect 反复触发，
  // 或让写操作触发过期的回调。
  const loadRef = useRef(load)
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    loadRef.current = load
    onChangedRef.current = onChanged
  })

  // 请求序号：初始加载返回前若又触发 reload（如左栏删除广播），
  // 旧请求后到会覆盖新结果；只采用最后一次发起的请求。
  const requestIdRef = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const requestId = ++requestIdRef.current
    try {
      const next = await loadRef.current(bookId)
      if (requestId !== requestIdRef.current) return
      setContent(next)
    } catch (error) {
      log.warn('回收站加载失败', error)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [bookId, log])

  // 外部软删除（章节 / 大纲左栏、伏笔 / 灵感列表）成功后重新拉取：
  // 回收站视图是条件挂载，挂载后不再走初始加载，需借模块级通知感知数据变化。
  useEffect(() => subscribeTrashChanged(() => void reload()), [reload])

  // 初始 / bookId 变化加载：异步拉取后再 setState（与 useChapterTree 同范式，
  // 不在 effect 体内同步 setState）。
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const next = await loadRef.current(bookId)
        if (active) setContent(next)
      } catch (error) {
        log.warn('回收站加载失败', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId, log])

  /** 执行一次回收站写操作：成功后刷新本视图并通知调用方。 */
  const runAction = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      if (busy) return
      setBusy(true)
      try {
        await action()
        // 顺序固定：先刷新列表，再通知调用方（调用方刷新树时以新列表为准）。
        await reload()
        onChangedRef.current()
      } catch (error) {
        log.warn('回收站操作失败', error)
      } finally {
        setBusy(false)
      }
    },
    [busy, reload, log]
  )

  return { content, loading, busy, runAction, reload }
}

export default useTrashData
