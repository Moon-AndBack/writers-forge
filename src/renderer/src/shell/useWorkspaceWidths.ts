import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useRegisterBeforeCloseFlush } from './beforeCloseFlush'
import {
  clampPaneWidth,
  decodeWorkspaceWidths,
  DEFAULT_WORKSPACE_WIDTHS,
  encodeWorkspaceWidths,
  fitWidthsToViewport,
  RIGHT_MAX,
  RIGHT_MIN,
  SIDE_MAX,
  SIDE_MIN,
  WORKSPACE_WIDTHS_SETTING_KEY,
  type WorkspaceWidths
} from './workspaceWidths'

/**
 * 落库防抖窗口：`useSplitter` 拖拽期间每帧经 rAF 回调 `onChange`，
 * 松手后还有一次终值回调。合并为「最后一次变更后 300ms 无新值才写盘」，
 * 拖拽过程中不产生任何 settings 写入。
 */
const PERSIST_DEBOUNCE_MS = 300

export interface UseWorkspaceWidthsOptions {
  /** 布局容器（`.workspace`）：用于实测可用宽度，过窄时按比例收缩左右栏。 */
  containerRef: RefObject<HTMLElement | null>
  /** 左栏是否自动收起（收起时不占宽度预算）。 */
  leftHidden: boolean
  /**
   * 右栏是否**实际不可见**：用户偏好隐藏 OR 窄窗断点（≤1240px，CSS 强制隐藏）。
   * 不可见时不占宽度预算，但宽度状态保留，再次显示时沿用。
   */
  rightHidden: boolean
}

export interface WorkspaceWidthsController {
  /** 左栏当前渲染宽度（已按视口钳制），下发 CSS 变量并作为分隔条受控值。 */
  sideWidth: number
  /** 右栏当前渲染宽度（同上）。 */
  rightWidth: number
  /** 拖拽 / 键盘 / 双击复位回调（逐帧调用，落库已防抖）。 */
  setSideWidth: (value: number) => void
  /** 同上，右栏。 */
  setRightWidth: (value: number) => void
}

/**
 * 三栏宽度的持久化 hook（`WorkspaceLayout` 唯一消费方）。
 *
 * - 恢复：挂载时 `settings:get` 读 `workspaceWidths`，解码 + 逐栏钳制后应用；
 *   读取失败 / 非法值静默回落默认（左 300 / 右 600）。恢复完成前用户已拖拽时
 *   以用户本次操作为准，迟到的持久值不覆盖。
 * - 写入：宽度变更后 300ms 防抖写盘（拖拽逐帧不写盘）；组件卸载时补写未落库的终值。
 * - 视口：ResizeObserver 实测 `.workspace` 宽度，`fitWidthsToViewport` 只收缩**渲染值**，
 *   不覆盖已保存的偏好——窗口变宽后宽度自动还原。
 * - 隐藏：左右栏隐藏（自动收起 / 偏好 / 窄窗断点）时保留各自宽度状态、不重置，
 *   仅从视口预算中剔除，再次显示时沿用原宽度。
 * - 无 `window.api`（纯浏览器预览）时以默认值渲染并静默跳过读写。
 */
export function useWorkspaceWidths({
  containerRef,
  leftHidden,
  rightHidden
}: UseWorkspaceWidthsOptions): WorkspaceWidthsController {
  const [widths, setWidths] = useState<WorkspaceWidths>(DEFAULT_WORKSPACE_WIDTHS)
  const [availableWidth, setAvailableWidth] = useState(0)

  /** 用户是否已手动改过宽度（早于持久值恢复完成时，避免被覆盖）。 */
  const dirtyRef = useRef(false)
  /** 待落库的终值。 */
  const pendingRef = useRef<WorkspaceWidths | null>(null)
  const timerRef = useRef<number | null>(null)

  // 启动恢复：异步读取，失败保持默认值。
  useEffect(() => {
    let active = true
    void window.api?.settings
      .get(WORKSPACE_WIDTHS_SETTING_KEY)
      .then((raw) => {
        if (!active || dirtyRef.current) return
        setWidths(decodeWorkspaceWidths(raw))
      })
      .catch(() => {
        /* 读取失败 / 无 API：保持默认宽度 */
      })
    return () => {
      active = false
    }
  }, [])

  // 视口实测：ResizeObserver 首次观测即回调一次，无需额外同步测量。
  useEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setAvailableWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [containerRef])

  const flush = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    try {
      await window.api?.settings.set(WORKSPACE_WIDTHS_SETTING_KEY, encodeWorkspaceWidths(pending))
    } catch {
      /* IPC 失败静默忽略，偏好保留在内存态 */
    }
  }, [])

  // 关闭窗口前补写挂起的终值（外壳 `flushAll` 会 await 本处理器）。
  useRegisterBeforeCloseFlush(flush)

  // 宽度变更 → 重置防抖计时器（同一窗口内只保留最后一次）。恢复态（dirty=false）不写盘。
  useEffect(() => {
    if (!dirtyRef.current) return
    pendingRef.current = widths
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void flush()
    }, PERSIST_DEBOUNCE_MS)
  }, [widths, flush])

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

  const setSideWidth = useCallback((value: number): void => {
    dirtyRef.current = true
    setWidths((prev) => {
      const left = clampPaneWidth(value, SIDE_MIN, SIDE_MAX, prev.left)
      return left === prev.left ? prev : { ...prev, left }
    })
  }, [])

  const setRightWidth = useCallback((value: number): void => {
    dirtyRef.current = true
    setWidths((prev) => {
      const right = clampPaneWidth(value, RIGHT_MIN, RIGHT_MAX, prev.right)
      return right === prev.right ? prev : { ...prev, right }
    })
  }, [])

  const fitted = useMemo(
    () => fitWidthsToViewport(widths, availableWidth, { leftHidden, rightHidden }),
    [widths, availableWidth, leftHidden, rightHidden]
  )

  return {
    sideWidth: fitted.left,
    rightWidth: fitted.right,
    setSideWidth,
    setRightWidth
  }
}
