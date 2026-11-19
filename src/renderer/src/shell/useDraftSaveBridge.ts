/**
 * 通用「草稿保存桥」：把右栏表单挂载时注册的 `saveNow` 收敛为一个稳定的
 * `save()` 入口，供切换守卫 / 关闭前 flush 调用。
 *
 * 设定档案 / 剧情 / 伏笔 / 灵感四域原各写一份相同实现，差异仅在日志前缀与
 * 失败文案；本 hook 只承接这段桥接。脏态判定（`useUnsavedGuard`）、放弃草稿、
 * 卸载前兜底落库仍归各域，不在此合并。
 *
 * 语义（与原实现逐条一致）：
 * - 无保存入口（表单未挂载）→ `false`，不假报成功；
 * - `saveNow()` 返回 `undefined`（无改动、无写入）→ 视为成功；
 * - `saveNow()` 显式返回 `false` → 失败；
 * - 抛错 → 记 warn 后按失败处理（不向上抛，守卫按失败保留脏态）。
 *
 * `saveRef` 为**原样透出**的 ref：右栏表单挂载时直接写 `.current`，调用方不得
 * 包装 / 转换，否则表单写入的不是同一个 ref。
 */
import { useCallback, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { createLogger } from '@renderer/lib/log'

/** 右栏表单注册的保存入口：同步 / 异步皆可，`false` = 真实失败。 */
export type DraftSaveNow = () => void | Promise<boolean>

export interface DraftSaveBridge {
  /** 保存入口 ref：表单挂载时写入 `saveNow`；原样透出，不得包装。 */
  saveRef: RefObject<DraftSaveNow | null>
  /** 无条件落库：无入口 / 抛错 / 显式 `false` → `false`；无写入（`undefined`）→ `true`。 */
  save: () => Promise<boolean>
}

export interface DraftSaveBridgeOptions {
  /** 日志作用域（`createLogger` 的 scope，沿用各域原前缀）。 */
  scope: string
  /** 保存失败日志文案（保留各域原文案，便于按域检索）。 */
  failMessage: string
}

export function useDraftSaveBridge({
  scope,
  failMessage
}: DraftSaveBridgeOptions): DraftSaveBridge {
  const saveRef = useRef<DraftSaveNow | null>(null)
  const log = useMemo(() => createLogger(scope), [scope])

  const save = useCallback(async (): Promise<boolean> => {
    const saveNow = saveRef.current
    if (!saveNow) return false
    try {
      const result = saveNow()
      // 表单无改动时 `saveNow` 直接返回 undefined（无写入）：视为成功。
      if (result === undefined) return true
      return (await result) !== false
    } catch (error) {
      log.warn(failMessage, error)
      return false
    }
  }, [log, failMessage])

  return { saveRef, save }
}
