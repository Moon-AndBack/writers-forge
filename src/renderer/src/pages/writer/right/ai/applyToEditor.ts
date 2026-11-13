import type { Editor, JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * 章节右栏 AI · 结果回插正文（纯函数，接收 Tiptap editor 实例，无 React）。
 *
 * 🔴 **不能**用 `insertContent(string)`：字符串会被 Tiptap 当 HTML / 纯文本解析，
 * 可能产生非 paragraph 顶层节点（如 `<h3>`、`<ul>`、`<blockquote>`），破坏章节正文
 * 「每段一个 paragraph」的存储口径。`ChaptersView` 的 StarterKit 已裁剪掉 heading /
 * 列表 / 引用 / codeBlock / hardBreak 等扩展，故此处**直接构造 paragraph JSON 数组**，
 * 每个非空行一个 paragraph（节点结构见 `EMPTY_CONTENT`：`{ type: 'paragraph', content: [...] }`）。
 *
 * 其它约束：
 * - 空文本（trim 后无内容）直接返回 false；
 * - 编辑器缺失 / 已销毁 / 定稿只读（`isEditable === false`）时返回 false；
 * - 命令链**不传** `emitUpdate: false`（Tiptap 3 亦无此选项）——必须触发 `update` 事件，
 *   才能让 `useChapterDoc` 的防抖保存落库。
 */

/** 编辑器可用性判定（同时收窄类型）。 */
function canEdit(editor: Editor | null): editor is Editor {
  return editor !== null && !editor.isDestroyed && editor.isEditable
}

/**
 * 文本 → 顶层 paragraph 节点数组。
 *
 * 按 `\n` 切行、逐行 trim 并丢弃空行：模型常用空行表示分段，空行本身不产生空段落；
 * 每行只含一个 text 节点，不带 marks（正文纯文本口径）。
 */
function toParagraphNodes(text: string): JSONContent[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: line }]
    }))
}

/**
 * 求「插入点」：把文档内任意位置换算成可安全插入块级节点的位置。
 *
 * - 落在块与块之间的边界（含文档起点）→ 原位插入；
 * - 落在**空段落**内部 → 替换该空段（避免正文开头 / 中间留下多余空段）；
 * - 落在有内容的段落内部 → 挪到该段末尾（整段之后插入，不把原句劈成两段）。
 */
function resolveInsertRange(doc: ProseMirrorNode, position: number): { from: number; to: number } {
  let offset = 0
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i)
    const start = offset
    const end = offset + node.nodeSize

    if (position <= start) return { from: position, to: position }
    if (position < end) {
      if (node.isTextblock && node.content.size === 0) return { from: start, to: end }
      return { from: end, to: end }
    }

    offset = end
  }

  const size = doc.content.size
  return { from: size, to: size }
}

/**
 * 替换编辑器当前选区为给定文本。
 * @returns 是否成功（无编辑器 / 定稿只读 / 选区失效时返回 false）
 */
export function replaceSelection(
  editor: Editor | null,
  text: string,
  range: { from: number; to: number }
): boolean {
  if (!canEdit(editor)) return false

  const nodes = toParagraphNodes(text)
  if (nodes.length === 0) return false

  const { from, to } = range
  // 文本选区合法区间为 [1, doc.content.size - 1]（0 与末尾是文档边界，不能建 TextSelection）。
  // Ctrl+A 的 AllSelection 是 [0, doc.content.size]，在这里归一化回文本区间；
  // 空文档 / 单空段（size <= 2）没有可替换范围，直接失败。
  const docSize = editor.state.doc.content.size
  if (docSize <= 2) return false
  if (!Number.isInteger(from) || !Number.isInteger(to)) return false
  const normalizedFrom = from === 0 ? 1 : from
  const normalizedTo = to === docSize ? docSize - 1 : to
  if (normalizedFrom < 1 || normalizedTo < normalizedFrom || normalizedTo > docSize - 1) {
    return false
  }

  // 面板抢走焦点后 ProseMirror 的 state.selection 仍是旧值，但链式命令按事务内的当前选区
  // 计算，故必须先用 setTextSelection 显式恢复选区，再 insertContent（替换选区内容）。
  return editor
    .chain()
    .focus()
    .setTextSelection({ from: normalizedFrom, to: normalizedTo })
    .insertContent(nodes)
    .run()
}

/**
 * 在指定位置之后插入给定文本（换段插入）。
 *
 * `position` 通常取选区快照的 `to`（无选区时即光标位置）；越界 / 非法返回 false。
 */
export function insertAfter(editor: Editor | null, text: string, position: number): boolean {
  if (!canEdit(editor)) return false

  const nodes = toParagraphNodes(text)
  if (nodes.length === 0) return false

  const size = editor.state.doc.content.size
  if (!Number.isInteger(position) || position < 0 || position > size) return false

  const target = resolveInsertRange(editor.state.doc, position)
  return editor.chain().focus().insertContentAt(target, nodes).run()
}
