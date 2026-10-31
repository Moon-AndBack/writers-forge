import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'
import type { AiError } from '../../../../../../preload/types/ai'

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
  /** 重新拉取。 */
  refresh: () => void
}

/**
 * 章节右栏 AI · 模型列表加载。
 *
 * - `active === false`（面板未打开）时不发起任何请求，惰性加载；
 * - 挂载 / 激活时先 `config.get()` 取服务商与当前模型，再 `models.list(provider)`；
 * - 每次请求带自增序号：快速切换 / 重复 refresh 时丢弃过期响应，旧结果不会覆盖新结果；
 * - 失败（`ok === false` / 抛错 / IPC 缺失）时 `error` 有值且 `models` 为空。
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

  const refresh = useCallback((): void => setRefreshTick((tick) => tick + 1), [])

  useEffect(() => {
    if (!active) return undefined

    const api = window.api?.ai
    const seq = seqRef.current + 1
    seqRef.current = seq
    let cancelled = false

    // 异步 IIFE：加载态的 setState 不放在 effect 同步段（避免级联渲染告警）。
    void (async () => {
      setLoading(true)
      setError(null)
      setModels([])

      if (!api) {
        setLoading(false)
        setError(UNKNOWN_ERROR)
        return
      }

      try {
        const config = await api.config.get()
        if (cancelled || seq !== seqRef.current) return
        setCurrent(config.model)

        const result = await api.models.list(config.provider)
        if (cancelled || seq !== seqRef.current) return

        if (result.ok) {
          setModels(result.models ?? [])
          setError(null)
        } else {
          setModels([])
          setError(result.error ?? UNKNOWN_ERROR)
        }
      } catch (err) {
        if (cancelled || seq !== seqRef.current) return
        log.warn('AI 模型列表读取失败', err)
        setModels([])
        setError(UNKNOWN_ERROR)
      } finally {
        if (!cancelled && seq === seqRef.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, refreshTick])

  return {
    models,
    current,
    // 面板关闭后不再算「加载中」：effect 已停止，结果不会再来。
    loading: active && loading,
    error,
    refresh
  }
}
