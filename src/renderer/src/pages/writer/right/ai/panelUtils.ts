import type { Editor } from '@tiptap/core'
import { readEditorSelection } from '../../../../components/editor/useEditorSelection'
import type { AiConversationMessage } from './chatRuntime'

/**
 * AI 面板的纯工具（从 `AiPanel.tsx` 拆出，控制单文件行数，AGENTS §3）。
 *
 * 只做「消息可回插判定 / 编辑器取文与字数 / 下拉选项」这类无状态换算，
 * 不持有 React 状态，也不碰请求与落库。
 */

/**
 * assistant 回复可回插的判定：**来自当前章**、非流式、无错误、未中断、正文非空
 * （user 消息恒不可回插）。
 *
 * 来源章规则：消息必须带 `chapterId` 且等于当前章——无章聊天产生的消息（`null`）
 * 与其它章的消息都拒绝回插，避免把 A 章的回复写进 B 章正文。
 *
 * `interrupted` 的半截回复同样不允许回插正文档：内容停在句子中间，且这类消息本就带着
 * 「未走完」的语义，写进正文只会留下残篇。
 */
export function canApplyMessage(
  message: AiConversationMessage,
  currentChapterId: number | null
): boolean {
  if (currentChapterId === null) return false
  if (message.chapterId == null || message.chapterId !== currentChapterId) return false
  return (
    message.role === 'assistant' &&
    message.streaming !== true &&
    message.error === undefined &&
    message.interrupted !== true &&
    message.content.trim() !== ''
  )
}

/** 当前选区字数（空选区 / 无编辑器 → 0）。 */
export function readSelectionChars(editor: Editor | null): number {
  const snapshot = readEditorSelection(editor)
  return snapshot === null || snapshot.empty ? 0 : snapshot.text.length
}

/**
 * 整章正文（段落之间以空行分隔）。
 *
 * 直接取纯文本会把各文本节点首尾相接、段间没有换行，送进模型后是一坨连续文字；
 * `textBetween` 用 `\n\n` 把段落读回来，模型才能感知分段。发送与字数统计共用本函数，
 * 保证两者口径一致（分隔符也计入字数）。
 */
export function readFullText(editor: Editor | null): string {
  if (!editor || editor.isDestroyed) return ''
  const { doc } = editor.state
  return doc.textBetween(0, doc.content.size, '\n\n')
}

/** 整章正文字数（与「携带全文」发送的内容同源，含段间分隔符）。 */
export function readTotalChars(editor: Editor | null): number {
  return readFullText(editor).length
}

/** 模型 ID → 下拉选项（展示名与 ID 一致）。 */
export function toOption(value: string): { value: string; label: string } {
  return { value, label: value }
}
