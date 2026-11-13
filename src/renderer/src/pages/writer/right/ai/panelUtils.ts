import type { Editor } from '@tiptap/core'
import { readEditorSelection } from '../../../../components/editor/useEditorSelection'
import type { AiConversationMessage } from './chatRuntime'
import type { AiComposeAction } from './functions'

/**
 * AI 面板的纯工具（从 `AiPanel.tsx` 拆出，控制单文件行数，AGENTS §3）。
 *
 * 只做「消息可回插判定 / 编辑器取文与字数 / 下拉选项」这类无状态换算，
 * 不持有 React 状态，也不碰请求与落库。
 */

/** 功能 → 文案 key（静态映射，避免拼接 key 丢类型）。胶囊与下拉共用。 */
export const ACTION_LABEL_KEYS = {
  polish: 'panel.action.polish',
  continue: 'panel.action.continue',
  rewrite: 'panel.action.rewrite',
  translate: 'panel.action.translate',
  chat: 'panel.action.chat'
} as const satisfies Record<AiComposeAction, string>

/** 一条 assistant 回复允许的回插动作集合。 */
export interface ApplyActions {
  /** 替换发送时选中的那段正文。 */
  replace: boolean
  /** 插入到发送时选区的末尾之后。 */
  insert: boolean
}

/**
 * assistant 回复可回插的判定 + 按功能收敛的动作集合。
 *
 * 前置条件（任一不满足 → `null`，完全不可回插）：**来自当前章**、assistant、
 * 非流式、无错误、未中断、正文非空（user 消息恒不可回插）。
 *
 * 来源章规则：消息必须带 `chapterId` 且等于当前章——无章聊天产生的消息（`null`）
 * 与其它章的消息都拒绝回插，避免把 A 章的回复写进 B 章正文。
 *
 * 动作矩阵：
 * - `polish` / `rewrite` / `translate`：只替换（成品替换选中段）；
 * - `continue`：只插入（续写接在选中段之后）；
 * - `chat`：两种都允许（自由对话无法预判用途）；
 * - `action` 为空的历史 / 未知消息：只插入——不能默认提供「替换选中」，
 *   否则旧续写回复也能整段覆盖正文。`fallbackAction` 由调用方从配对的 user
 *   消息推断功能后传入。
 */
export function applyActionsFor(
  message: AiConversationMessage,
  currentChapterId: number | null,
  fallbackAction?: AiComposeAction
): ApplyActions | null {
  if (currentChapterId === null) return null
  if (message.chapterId == null || message.chapterId !== currentChapterId) return null
  const eligible =
    message.role === 'assistant' &&
    message.streaming !== true &&
    message.error === undefined &&
    message.interrupted !== true &&
    message.content.trim() !== ''
  if (!eligible) return null

  const action = message.action ?? fallbackAction
  if (action === 'continue') return { replace: false, insert: true }
  if (action === 'polish' || action === 'rewrite' || action === 'translate') {
    return { replace: true, insert: false }
  }
  if (action === 'chat') return { replace: true, insert: true }
  return { replace: false, insert: true }
}

/**
 * 为某条 assistant 回复推断功能：向前找最近的 user 消息（配对轮次）。
 *
 * 历史消息的 `action` 为空时用它兜底；配对 user 也没有 `action`（同样来自旧库）
 * 时返回 `undefined`，由 `applyActionsFor` 落到「只插入」。
 */
export function fallbackActionFor(
  messages: AiConversationMessage[],
  index: number
): AiComposeAction | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    const previous = messages[i]
    if (previous === undefined || previous.divider !== undefined) continue
    if (previous.role !== 'user') continue
    return previous.action
  }
  return undefined
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
