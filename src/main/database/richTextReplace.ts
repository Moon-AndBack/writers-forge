/**
 * 章节搜索替换的「保留格式」段内替换工具（纯函数、无副作用）。
 *
 * `paragraphs.content_json` 存的是**单个块级 Tiptap 节点**的 JSON 串（如
 * `{ type:'paragraph', content:[{ type:'text', text:'…', marks:[…] }] }`），
 * 其纯文本口径等于该块的 `textContent`：所有 `text` 叶子按文档序拼接。
 *
 * 章节搜索替换原先命中后把 `contentJson` 置 `null`，段内加粗 / 斜体随之丢失。
 * 本模块按**段内纯文本字符区间**定位唯一的 `text` 叶子，只改 `text` 字段，
 * `marks` 与块结构原样保留；命中跨多个文本节点时返回 `null`，由调用方按既有行为
 * 回落纯文本（不做跨节点合并：把半个词改格式比整段回落更难预料）。
 */

/** JSON 节点（宽松读取，字段按需取用）。 */
interface JsonNode {
  text?: unknown
  content?: unknown
  [key: string]: unknown
}

/** 文本叶子及其在段内纯文本中的区间。 */
interface TextSlot {
  node: JsonNode
  /** 所属节点：文本被替换为空时需从它的 `content` 中移除。 */
  parent: JsonNode | null
  start: number
  end: number
  text: string
}

function isJsonNode(value: unknown): value is JsonNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 解析块级 JSON：非法 JSON / 非对象 → null（不抛错）。 */
function parseBlock(json: string): JsonNode | null {
  if (typeof json !== 'string' || json.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  return isJsonNode(parsed) ? parsed : null
}

/**
 * 按文档序收集 `text` 叶子并累计纯文本偏移（与 ProseMirror `textContent` 同口径：
 * 只计 `text` 叶子的文本，hardBreak / 图片等行内节点不产生字符）。
 */
function collectSlots(
  node: unknown,
  parent: JsonNode | null,
  slots: TextSlot[],
  offset: number
): number {
  if (!isJsonNode(node)) return offset
  if (typeof node.text === 'string') {
    slots.push({ node, parent, start: offset, end: offset + node.text.length, text: node.text })
    return offset + node.text.length
  }
  if (!Array.isArray(node.content)) return offset
  let next = offset
  for (const child of node.content) next = collectSlots(child, node, slots, next)
  return next
}

/** 取块 JSON 的文本叶子（按文档序）。 */
function textSlots(block: JsonNode): TextSlot[] {
  const slots: TextSlot[] = []
  collectSlots(block, null, slots, 0)
  return slots
}

/**
 * 移除被替换空的 `text` 叶子：空文本节点在 Tiptap schema 中不合法，且会留下无意义的 marks。
 * 父块 `content` 因此清空时一并删除该字段（等价于 `{ type:'paragraph' }` 空段）。
 */
function removeTextNode(slot: TextSlot): boolean {
  const parent = slot.parent
  if (parent === null || !Array.isArray(parent.content)) return false
  const index = parent.content.indexOf(slot.node)
  if (index === -1) return false
  parent.content.splice(index, 1)
  if (parent.content.length === 0) delete parent.content
  return true
}

/**
 * 在已解析的块上做一次替换：命中须完全落在**单个** `text` 叶子内。
 * 成功返回 true（原地修改）；跨节点 / 越界 → false（不做任何改动）。
 */
function applyReplace(
  block: JsonNode,
  charStart: number,
  charEnd: number,
  replacement: string
): boolean {
  const slot = textSlots(block).find((item) => item.start <= charStart && charEnd <= item.end)
  if (slot === undefined) return false
  const next =
    slot.text.slice(0, charStart - slot.start) + replacement + slot.text.slice(charEnd - slot.start)
  if (next === '') return removeTextNode(slot)
  slot.node.text = next
  return true
}

/**
 * 在块 JSON 的文本节点里替换字符区间，保留 marks 与块结构。
 * 区间跨多个文本节点（或越界 / 参数非法 / 替换文本含换行）时返回 null，由调用方回退。
 *
 * @param json 单个块级 Tiptap 节点 JSON 串
 * @param charStart 段内纯文本起点（UTF-16 code unit，含）
 * @param charEnd 段内纯文本终点（不含）
 * @param replacement 替换文本（不得含换行：换行需拆段，交给调用方回退）
 */
export function replaceInBlockJson(
  json: string,
  charStart: number,
  charEnd: number,
  replacement: string
): string | null {
  if (
    !Number.isInteger(charStart) ||
    !Number.isInteger(charEnd) ||
    charStart < 0 ||
    charEnd <= charStart ||
    /[\r\n]/.test(replacement)
  ) {
    return null
  }
  const block = parseBlock(json)
  if (block === null || !applyReplace(block, charStart, charEnd, replacement)) return null
  return JSON.stringify(block)
}

/**
 * 段内**全部非重叠命中**一次替换（与 `replaceOccurrences` 同口径：按 `query.length` 步进）。
 * 任一处命中跨文本节点 → 返回 null（整段回落），避免同段一半保留格式、一半纯文本。
 */
export function replaceAllInBlockJson(
  json: string,
  query: string,
  replacement: string
): string | null {
  if (query === '' || /[\r\n]/.test(replacement)) return null
  const block = parseBlock(json)
  if (block === null) return null
  let text = blockJsonPlainText(json)
  if (text === null) return null
  let from = 0
  while (true) {
    const at = text.indexOf(query, from)
    if (at === -1) break
    if (!applyReplace(block, at, at + query.length, replacement)) return null
    text = text.slice(0, at) + replacement + text.slice(at + query.length)
    from = at + replacement.length
  }
  return JSON.stringify(block)
}

/**
 * 块级 JSON 的纯文本（`text` 叶子按文档序拼接）：调用方据此校验 JSON 与 `text` 列同源，
 * 防止陈旧 JSON 把替换写到错位字符上。非法 JSON → null。
 */
export function blockJsonPlainText(json: string): string | null {
  const block = parseBlock(json)
  if (block === null) return null
  return textSlots(block)
    .map((slot) => slot.text)
    .join('')
}
