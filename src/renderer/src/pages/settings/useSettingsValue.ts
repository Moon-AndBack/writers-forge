import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 同键广播表：设置弹窗与消费方（如写作域 `autoSave`）可能同时订阅同一个键。
 * `useSettingsValue` 写入后广播原始字符串，订阅方据此即时更新，避免设置改完
 * 需重挂组件才生效。跨窗口同步不在本表范围（`window.api.settings` 无广播通道）。
 */
type SettingsListener = (raw: string | null) => void
const listeners = new Map<string, Set<SettingsListener>>()

function subscribeSetting(key: string, listener: SettingsListener): () => void {
  const bucket = listeners.get(key) ?? new Set<SettingsListener>()
  bucket.add(listener)
  listeners.set(key, bucket)
  return () => {
    bucket.delete(listener)
    if (bucket.size === 0) listeners.delete(key)
  }
}

function broadcastSetting(key: string, raw: string | null): void {
  listeners.get(key)?.forEach((listener) => listener(raw))
}

/**
 * settings 表键值的读写 hook（设置页 / 设置消费方共用）。
 *
 * 与既有 Provider（ThemeProvider / RightPaneVisibilityProvider 等）同一范式：
 * 挂载时异步 `settings:get` 恢复、变更时 `settings:set` 落库；无 `window.api`
 * （纯浏览器预览 / 测试）时以默认值渲染并静默跳过读取与写入。
 *
 * 泛型设计：`decode` 负责把数据库中的字符串（可能为 null / 非法）规整为业务值，
 * `encode` 负责把业务值序列化回字符串。这样布尔、枚举等类型无需各自实现一个 hook。
 *
 * 注意：`decode` / `encode` 以 ref 持有（仅在 effect 内更新），故调用方可安全传入
 * 内联箭头函数而不触发读取 effect 重跑；读取只在 `key` 变化时执行一次。
 */
export interface SettingsValueController<T> {
  /** 当前业务值（读取完成前为 `fallback`）。 */
  value: T
  /** 更新并落库（低频操作，即时写入；IPC 失败静默忽略）。 */
  setValue: (next: T) => void
}

export function useSettingsValue<T>(
  key: string,
  fallback: T,
  decode: (raw: string | null) => T,
  encode: (value: T) => string = (value) => String(value)
): SettingsValueController<T> {
  const [value, setValueState] = useState<T>(fallback)

  // 解码 / 编码器：以 ref 持有最新实现（在 effect 内更新，避免渲染期写 ref），
  // 使调用方可传内联函数而不会导致下方的读取 effect 反复重跑。
  const decodeRef = useRef(decode)
  const encodeRef = useRef(encode)

  useEffect(() => {
    decodeRef.current = decode
    encodeRef.current = encode
  })

  useEffect(() => {
    const api = window.api?.settings
    if (!api) return undefined

    let active = true
    // 同键变更即时同步（例如设置弹窗切换 autoSave，写作域消费方同步生效）。
    const unsubscribe = subscribeSetting(key, (raw) => {
      if (active) setValueState(decodeRef.current(raw))
    })
    api
      .get(key)
      .then((raw) => {
        if (active) setValueState(decodeRef.current(raw))
      })
      .catch(() => {
        /* 读取失败保持默认值（与既有 Provider 一致，静默回退） */
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [key])

  const setValue = useCallback(
    (next: T): void => {
      const raw = encodeRef.current(next)
      setValueState(next)
      broadcastSetting(key, raw)
      void window.api?.settings.set(key, raw).catch(() => {})
    },
    [key]
  )

  return { value, setValue }
}

export default useSettingsValue
