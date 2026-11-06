import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { AiError, AiProviderId } from '../../../../../../preload/types/ai'

/** 模型列表日志（转发至主进程落盘）。 */
const log = createLogger('useAiModels')

/** IPC 不可用 / 未知异常时的兜底错误（脱敏，无正文）。 */
const UNKNOWN_ERROR: AiError = { code: 'unknown', message: '' }

export interface AiModelsState {
  /** 模型 ID 列表。 */
  models: string[]
  /** 当前生效的模型（config.model）。 */
  current: string
  loading: boolean
  error: AiError | null
  /** 重新拉取（强制联网）。 */
  refresh: () => void
}

/**
 * 章节右栏 AI · 模型列表加载。
 *
 * - `active === false`（面板未打开）时不发起任何请求，惰性加载；
 * - 挂载 / 激活时先 `config.get()` 取服务商与当前模型，再读模型缓存（`mode: 'cache'`）：
 *   命中即渲染，**不先清空列表**；缓存缺失或已过期（`stale`）才后台联网刷新；
 * - 后台刷新期间保留旧列表、不显示 loading；刷新失败不改状态、不清列表；
 * - 手动 `refresh()` 强制联网（`mode: 'refresh'`），失败时保留已有列表并展示错误；
 * - 每次请求带自增序号：快速切换 / 重复 refresh 时丢弃过期响应，旧结果不会覆盖新结果。
 */
export function useAiModels(active: boolean): AiModelsState {
  const [models, setModels] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AiError | null>(null)
  /** refresh 自增触发器（作为 effect 依赖，不参与渲染展示）。 */
  const [refreshTick, setRefreshTick] = useState(0)
  /** 请求序号：只有最新一次请求的结果会被采纳。 */
  const seqRef = useRef(0)
  /** 当前列表快照：判断「失败时是否已有内容可留」不依赖闭包里的旧 state。 */
  const modelsRef = useRef<string[]>([])
  /** 下一次 effect 是否为手动刷新（跳过缓存、强制联网）。 */
  const forceRef = useRef(false)

  const applyModels = useCallback((list: string[]): void => {
    modelsRef.current = list
    setModels(list)
  }, [])

  const refresh = useCallback((): void => {
    forceRef.current = true
    setRefreshTick((tick) => tick + 1)
  }, [])

  useEffect(() => {
    if (!active) return undefined

    const api = window.api?.ai
    const seq = seqRef.current + 1
    seqRef.current = seq
    let cancelled = false
    const forced = forceRef.current
    forceRef.current = false
    const alive = (): boolean => !cancelled && seq === seqRef.current

    // 异步 IIFE：加载态的 setState 不放在 effect 同步段（避免级联渲染告警）。
    void (async () => {
      if (!api) {
        setLoading(false)
        setError(UNKNOWN_ERROR)
        return
      }

      let provider: AiProviderId
      try {
        const config = await api.config.get()
        if (!alive()) return
        setCurrent(config.model)
        provider = config.provider
      } catch (err) {
        if (!alive()) return
        log.warn('AI 配置读取失败', err)
        applyModels([])
        setError(UNKNOWN_ERROR)
        setLoading(false)
        return
      }

      setError(null)

      /* ---------- 1. 缓存优先（手动刷新跳过） ---------- */
      let hasCache = false
      let stale = false
      if (!forced) {
        try {
          const cached = await api.models.list(provider, 'cache')
          if (!alive()) return
          if (cached.ok && (cached.models?.length ?? 0) > 0) {
            hasCache = true
            stale = cached.stale === true
            applyModels(cached.models ?? [])
          }
        } catch {
          // 缓存读取异常按未命中处理：继续走联网刷新。
        }
      }

      if (!alive()) return
      // 缓存新鲜：直接收工。
      if (hasCache && !stale) {
        setLoading(false)
        return
      }

      /* ---------- 2. 联网刷新 ---------- */
      // 有缓存的后台刷新保持静默（不显示 loading）；无缓存 / 手动刷新才展示加载态。
      const silent = hasCache && !forced
      const hasVisible = hasCache || modelsRef.current.length > 0
      if (!hasCache) setLoading(true)

      try {
        const result = await api.models.list(provider, 'refresh')
        if (!alive()) return

        const list = result.models ?? []
        if (result.ok) {
          if (list.length > 0 || !hasVisible) applyModels(list)
          setError(null)
        } else if (!silent) {
          // 失败：保留已有列表（不清空），仅在没有任何内容时展示错误。
          setError(result.error ?? UNKNOWN_ERROR)
          if (!hasVisible) applyModels([])
        }
      } catch (err) {
        if (!alive()) return
        if (!silent) {
          log.warn('AI 模型列表刷新失败', err)
          setError(UNKNOWN_ERROR)
          if (!hasVisible) applyModels([])
        }
      } finally {
        if (alive()) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, refreshTick, applyModels])

  return {
    models,
    current,
    // 面板关闭后不再算「加载中」：effect 已停止，结果不会再来。
    loading: active && loading,
    error,
    refresh
  }
}
