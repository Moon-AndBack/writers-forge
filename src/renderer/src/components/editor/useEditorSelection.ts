import type { Editor } from '@tiptap/core'

/**
 * 编辑器选区快照（右栏 AI 对话面板「发送时」取自正文编辑器）。
 *
 * 纯读取工具，**不做实时订阅**：面板只在发送消息的瞬间快照一次，不需要持续跟随光标。
 * 文件名为 `useXxx` 沿项目 hooks 目录习惯，但导出的是纯函数（不含任何 React hook），
 * 故可在事件回调 / 非组件上下文中直接调用。
 */
export interface EditorSelectionSnapshot {
  /** 选区起点（文档位置）。 */
  from: number
  /** 选区终点。 */
  to: number
  /** 选中文本（跨段以 `\n` 连接）；未选中时为空串。 */
  text: string
  /** 是否为空选区（仅光标）。 */
  empty: boolean
}

/**
 * 读取当前选区快照；编辑器为空 / 已销毁 / 选区无效时返回 null。
 *
 * 失焦后仍可读：ProseMirror 的 `state.selection` 是编辑器内部状态，不随 DOM blur 清空，
 * 故面板聚焦到输入框后依然能拿到「用户刚才在正文里选中的那一段」。
 *
 * 文本一律走 `doc.textBetween(from, to, '\n')` 按选区裁剪（`editor.getText()` 取的是整篇，
 * 不适用）；第三个参数是 ProseMirror 的**块分隔符**——选区横跨多个 paragraph 时用它把
 * 各段文本以 `\n` 粘起来，避免段与段直接粘连成一行。
 */
export function readEditorSelection(editor: Editor | null): EditorSelectionSnapshot | null {
  if (!editor || editor.isDestroyed) return null

  const { selection, doc } = editor.state
  if (!selection) return null

  const { from, to, empty } = selection
  // 越界 / 逆序均为非法选区（`doc.content.size` 为最后一个合法位置）。
  if (!Number.isInteger(from) || !Number.isInteger(to)) return null
  if (from < 0 || to < from || to > doc.content.size) return null

  return {
    from,
    to,
    text: empty ? '' : doc.textBetween(from, to, '\n'),
    empty
  }
}
