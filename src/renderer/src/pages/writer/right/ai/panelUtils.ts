import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
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
  /** 插入落点是否为全文末尾（发送时勾选「携带全文」）。 */
  insertAtEnd: boolean
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
 *
 * 插入落点由消息快照的 `carryFull` 决定（见 `useApplyToEditor.handleApplyInsert`），
 * `insertAtEnd` 供气泡切换按钮文案。
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

  // 携带全文发送的回复：插入落点是全文末尾，按钮文案据此区分（见 `ChatMessage`）。
  const insertAtEnd = message.selection?.carryFull === true
  const action = message.action ?? fallbackAction
  if (action === 'continue') return { replace: false, insert: true, insertAtEnd }
  if (action === 'polish' || action === 'rewrite' || action === 'translate') {
    return { replace: true, insert: false, insertAtEnd }
  }
  if (action === 'chat') return { replace: true, insert: true, insertAtEnd }
  return { replace: false, insert: true, insertAtEnd }
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

/** 块分隔符（与 `readFullText` 传给 `textBetween` 的实参一致）。 */
const PARAGRAPH_SEPARATOR = '\n\n'

/** 单个顶层块的测量结果（`textBetween` 口径）。 */
interface BlockChars {
  /** 块内全部文本节点的字符数。 */
  chars: number
  /** 块内文本块数量：`textBetween` 在每个文本块前插块分隔符（首个除外）。 */
  textBlocks: number
}

/**
 * 顶层块字数缓存。
 *
 * ProseMirror 节点不可变且结构共享：未被事务触碰的块保持同一引用，故以节点对象为 key
 * 缓存后，一次编辑只需重算被改动的块（与 `docWordLimit` 的块级缓存同一思路）。
 */
const blockCharsCache = new WeakMap<ProseMirrorNode, BlockChars | null>()

/** 整篇 doc → 字数：同一次编辑内的多次读取（选区 / 焦点 / 重渲染）直接命中。 */
const docCharsCache = new WeakMap<ProseMirrorNode, number>()

/**
 * 测量单个顶层块（结果缓存）。
 *
 * 返回 `null` 表示该块含带 `leafText` 的叶子节点（`textBetween` 会为它产出文本），
 * 块级快路径不覆盖这种结构，由调用方回退全文统计以保证口径一致。
 */
function measureBlock(node: ProseMirrorNode): BlockChars | null {
  const cached = blockCharsCache.get(node)
  if (cached !== undefined) return cached

  let chars = 0
  let textBlocks = 0
  let unsupported = false

  const visit = (current: ProseMirrorNode): void => {
    if (current.isText) {
      chars += current.text?.length ?? 0
      return
    }
    if (current.isTextblock) textBlocks += 1
    if (current.isLeaf) {
      if (current.type.spec.leafText) unsupported = true
      return
    }
    current.forEach((child) => visit(child))
  }
  visit(node)

  const measured = unsupported ? null : { chars, textBlocks }
  blockCharsCache.set(node, measured)
  return measured
}

/** 整篇正文字数（与 `readFullText` 同值：文本块以 `\n\n` 拼接后的字符串长度）。 */
function measureDocChars(doc: ProseMirrorNode): number {
  const cached = docCharsCache.get(doc)
  if (cached !== undefined) return cached

  let chars = 0
  let textBlocks = 0
  let unsupported = false
  doc.forEach((node) => {
    const measured = measureBlock(node)
    if (measured === null) {
      unsupported = true
      return
    }
    chars += measured.chars
    textBlocks += measured.textBlocks
  })

  // 分隔符只在第 2 个起每个文本块前各插一次 → 总数 = 文本块数 - 1。
  const total = unsupported
    ? doc.textBetween(0, doc.content.size, PARAGRAPH_SEPARATOR).length
    : chars + Math.max(0, textBlocks - 1) * PARAGRAPH_SEPARATOR.length

  docCharsCache.set(doc, total)
  return total
}

/**
 * 整章正文字数（与「携带全文」发送的内容同源，含段间分隔符）。
 *
 * 走整篇 / 块级两级缓存：切章、选区变化、面板重渲染都不再逐字重扫全篇，
 * 只有正文实际改动时才重算被触碰的块。
 */
export function readTotalChars(editor: Editor | null): number {
  if (!editor || editor.isDestroyed) return 0
  return measureDocChars(editor.state.doc)
}

/** 模型 ID → 下拉选项（展示名与 ID 一致）。 */
export function toOption(value: string): { value: string; label: string } {
  return { value, label: value }
}
