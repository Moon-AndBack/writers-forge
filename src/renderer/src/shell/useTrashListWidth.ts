import { useCallback, useEffect, useRef, useState } from 'react'
import { useRegisterBeforeCloseFlush } from './beforeCloseFlush'
import {
  clampTrashListWidth,
  decodeTrashListWidth,
  encodeTrashListWidth,
  TRASH_LIST_DEFAULT,
  TRASH_LIST_WIDTH_SETTING_KEY
} from './trashListWidth'

/**
 * 落库防抖窗口：`useSplitter` 拖拽期间每帧经 rAF 回调 `onChange`，
 * 松手后还有一次终值回调。合并为「最后一次变更后 300ms 无新值才写盘」，
 * 拖拽过程中不产生任何 settings 写入。
 */
const PERSIST_DEBOUNCE_MS = 300

export interface TrashListWidthController {
  /** 当前列表卡宽度（已钳制，供 Splitter 受控值与 CSS 变量）。 */
  width: number
  /** 拖拽 / 键盘 / 双击复位回调（逐帧调用，落库已防抖）。 */
  setWidth: (value: number) => void
}

/**
 * 回收站列表卡宽度的持久化 hook（`TrashSplitLayout` 唯一消费方）。
 *
 * - 恢复：挂载时 `settings:get` 读 `trashListWidth`，解码 + 钳制后应用；
 *   读取失败 / 非法值静默回落默认 260。恢复完成前用户已拖拽时以用户操作为准，
 *   迟到的持久值不覆盖。
 * - 写入：宽度变更后 300ms 防抖写盘（拖拽逐帧不写盘）；卸载时补写未落库的终值，
 *   关闭窗口前经 `useRegisterBeforeCloseFlush` 补写挂起值。
 * - 无 `window.api`（纯浏览器预览）时以默认值渲染并静默跳过读写。
 */
export function useTrashListWidth(): TrashListWidthController {
  const [width, setWidthState] = useState(TRASH_LIST_DEFAULT)

  /** 用户是否已手动改过宽度（早于持久值恢复完成时，避免被覆盖）。 */
  const dirtyRef = useRef(false)
  /** 待落库的终值。 */
  const pendingRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)

  // 启动恢复：异步读取，失败保持默认值。
  useEffect(() => {
    let active = true
    void window.api?.settings
      .get(TRASH_LIST_WIDTH_SETTING_KEY)
      .then((raw) => {
        if (!active || dirtyRef.current) return
        setWidthState(decodeTrashListWidth(raw))
      })
      .catch(() => {
        /* 读取失败 / 无 API：保持默认宽度 */
      })
    return () => {
      active = false
    }
  }, [])

  const flush = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current
    if (pending === null) return
    pendingRef.current = null
    try {
      await window.api?.settings.set(TRASH_LIST_WIDTH_SETTING_KEY, encodeTrashListWidth(pending))
    } catch {
      /* IPC 失败静默忽略，偏好保留在内存态 */
    }
  }, [])

  // 关闭窗口前补写挂起的终值（外壳 `flushAll` 会 await 本处理器）。
  useRegisterBeforeCloseFlush(flush)

  // 宽度变更 → 重置防抖计时器（同一窗口内只保留最后一次）。恢复态（dirty=false）不写盘。
  useEffect(() => {
    if (!dirtyRef.current) return
    pendingRef.current = width
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flush()
    }, PERSIST_DEBOUNCE_MS)
  }, [width, flush])

  // 卸载（切页 / 关闭）：清掉挂起的计时器并立即补写最后终值。
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      void flush()
    },
    [flush]
  )

  const setWidth = useCallback((value: number): void => {
    dirtyRef.current = true
    setWidthState((prev) => {
      const next = clampTrashListWidth(value, prev)
      return next === prev ? prev : next
    })
  }, [])

  return { width, setWidth }
}
