import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * 选区 → 段落锚点（纯函数，无 React 依赖）。
 *
 * 「段落」在本项目里指**文档顶层块**，`paragraphIdx` 是 **doc 的第 n 个子节点**（0 起），
 * 不是「第 n 个 paragraph」：
 * - 章节编辑器每段就是顶层 `paragraph`，两种口径等价；
 * - 大纲编辑器是富文本，顶层还可能出现 `heading` / `bulletList` / `blockquote` 等块，
 *   此时序号按顶层块计（与伏笔数据层 `paragraph_idx` 的存储口径一致）。
 *
 * 仅当**选区非空**且**首尾落在同一个顶层块内**时返回，否则返回 `null`：
 * - 跨块选区无法用单条 `quote` + 段内区间表达；
 * - 块内只有原子节点（图片 / 分隔线）而无文字时 `charEnd === charStart`，同样不产生锚点。
 */
export interface ParagraphAnchorInfo {
  /** 顶层块序号（doc 第 n 个子节点，0 起）。 */
  paragraphIdx: number
  /** 锚定段落文本（顶层块的 `textContent`，用于失效判定）。 */
  quote: string
  /** 相对段落文本的字符起点（左闭）。 */
  charStart: number
  /** 相对段落文本的字符终点（右开）。 */
  charEnd: number
}

/**
 * 把绝对文档位置换算成「块文本内」的字符偏移。
 *
 * 不能直接用 `pos - contentStart`：段内原子节点（如行内图片 / 硬换行）占文档位置
 * 但不贡献 `textContent`，直接相减会让偏移越界。`textBetween` 以文本坐标累计，
 * 并把无文字叶子节点的 `leafText` 设为空串，口径与 `node.textContent` 一致。
 */
function textOffsetAt(node: PMNode, absPos: number, contentStart: number): number {
  const relative = Math.max(0, Math.min(node.content.size, absPos - contentStart))
  return node.textBetween(0, relative, undefined, '').length
}

export function resolveParagraphAnchor(editor: Editor): ParagraphAnchorInfo | null {
  if (editor.isDestroyed) return null
  const { doc, selection } = editor.state
  if (selection.empty) return null

  // 起点所在顶层块。终点用 `to - 1` 反查：选区恰好收在块尾时 `$to` 可能落在下一个块
  // 的边界（`index(0)` 指向下一块），回退一位才是被选中的最后一块。
  const paragraphIdx = selection.$from.index(0)
  const endIdx = doc.resolve(selection.to - 1).index(0)
  if (endIdx !== paragraphIdx) return null

  // 遍历顶层节点累计块起点（doc 首个子节点从位置 0 起算）。
  let blockStart = 0
  for (let i = 0; i < paragraphIdx; i += 1) blockStart += doc.child(i).nodeSize
  const node = doc.child(paragraphIdx)
  const contentStart = blockStart + 1
  const contentEnd = contentStart + node.content.size

  // 选区必须完整落在该块的内容区间内（排除整块 NodeSelection / AllSelection 的边界偏差）。
  if (selection.from < contentStart || selection.to > contentEnd) return null

  const quote = node.textContent
  const charStart = textOffsetAt(node, selection.from, contentStart)
  const charEnd = textOffsetAt(node, selection.to, contentStart)
  if (charStart < 0 || charEnd > quote.length || charEnd <= charStart) return null

  return { paragraphIdx, quote, charStart, charEnd }
}

export default resolveParagraphAnchor
