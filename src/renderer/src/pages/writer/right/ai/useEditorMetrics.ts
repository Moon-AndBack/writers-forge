import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'
import { readEditorSelection } from '../../../../components/editor/useEditorSelection'
import { readSelectionChars, readTotalChars } from './panelUtils'

/**
 * 从正文编辑器派生的只读指标（从 `AiPanel` 拆出，控制单文件行数，AGENTS §3）。
 *
 * 全部走 `useSyncExternalStore` 订阅编辑器的 `selectionUpdate` / `update`——面板聚焦在
 * 输入框时选区仍在编辑器内部状态里，用户回正文改选 / 打字后提示与上下文占用要跟着变；
 * 不在 effect 里 setState（避免级联渲染）。
 *
 * 额外订阅 `focus` / `blur`：选区镜像只在失焦期存在，而 blur 不触发
 * `selectionUpdate`（选区本身没变），只能靠这两个事件驱动重渲染。
 *
 * 快照取值必须引用稳定：数量是 number、选区文案是 string（按值比较），
 * 选区 range 由 `rangeRef` 复用同一对象，`getSnapshot` 返回新对象会触发无限重渲染。
 *
 * `active === false`（AI 页签不可见）时**不订阅**编辑器，快照返回空指标（0 / 空串 /
 * null / false）：面板在右栏常驻但只 `hidden`，若照常订阅，Writer 层任何 state 变化
 * （切章 / 切卷 / 切页签 / dirty 等）都会触发一次全篇字数统计。
 */
export interface EditorMetrics {
  /** 当前选区字数（空选区 → 0）。 */
  selectionChars: number
  /** 整章正文字数（与「携带全文」发送内容同源）。 */
  totalChars: number
  /** 当前选区文本（空选区 → 空串）。 */
  selectionText: string
  /** 当前非空选区的 range（空选区 → null）；选区镜像与字数提示同源。 */
  selectionRange: { from: number; to: number } | null
  /** 编辑器是否持有焦点。 */
  editorFocused: boolean
}

export function useEditorMetrics(editor: Editor | null, active: boolean): EditorMetrics {
  const subscribeEditor = useCallback(
    (onStoreChange: () => void): (() => void) => {
      // 页签不可见时不订阅：编辑器的选区 / 更新事件与面板重渲染都不该驱动全篇统计。
      if (!active || !editor || editor.isDestroyed) return () => undefined
      editor.on('selectionUpdate', onStoreChange)
      editor.on('update', onStoreChange)
      editor.on('focus', onStoreChange)
      editor.on('blur', onStoreChange)
      return () => {
        editor.off('selectionUpdate', onStoreChange)
        editor.off('update', onStoreChange)
        editor.off('focus', onStoreChange)
        editor.off('blur', onStoreChange)
      }
    },
    [active, editor]
  )

  const rangeRef = useRef<{ from: number; to: number } | null>(null)
  const readSelectionRange = useCallback((): { from: number; to: number } | null => {
    const snapshot = readEditorSelection(editor)
    const next =
      snapshot === null || snapshot.empty ? null : { from: snapshot.from, to: snapshot.to }
    const prev = rangeRef.current
    if (prev !== null && next !== null && prev.from === next.from && prev.to === next.to) {
      return prev
    }
    rangeRef.current = next
    return next
  }, [editor])

  const selectionChars = useSyncExternalStore(
    subscribeEditor,
    () => (active ? readSelectionChars(editor) : 0),
    () => 0
  )
  const totalChars = useSyncExternalStore(
    subscribeEditor,
    () => (active ? readTotalChars(editor) : 0),
    () => 0
  )
  const selectionText = useSyncExternalStore(
    subscribeEditor,
    () => (active ? (readEditorSelection(editor)?.text ?? '') : ''),
    () => ''
  )
  const selectionRange = useSyncExternalStore(
    subscribeEditor,
    () => (active ? readSelectionRange() : null),
    () => null
  )
  const editorFocused = useSyncExternalStore(
    subscribeEditor,
    () => active && editor !== null && !editor.isDestroyed && editor.isFocused,
    () => false
  )

  return { selectionChars, totalChars, selectionText, selectionRange, editorFocused }
}
