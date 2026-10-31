/**
 * 富文本块级文档 JSON 构造 · 主进程与渲染层共用的纯函数。
 *
 * 本文件为**无依赖纯函数**（不 import 任何模块、不触碰 Node / Electron API、无副作用），
 * 以保证可被渲染层直接打包（不得反向依赖 `src/main/**`）。
 *
 * 主进程经 `src/main/database/richText.ts` 再导出，既有导入路径保持不变；
 * 渲染层（设定库正文兜底）直接引用本模块。
 */

/**
 * 纯文本 → 合法富文本文档 JSON 串（按行拆为多个 `paragraph`，`\r?\n` 均识别）。
 *
 * 空文本（仅空白）→ **空串 `''`**：表示「无富文本」（与 `world_texts.body_json`
 * 的 `'' = 无富文本` 口径一致；此处不返回 `null`）。
 *
 * ⚠️ Tiptap 不允许空 `text` 节点，空行必须写成 `{ type: 'paragraph' }`（**省略**
 * `content`），不得写成 `content: []` + 空 text。
 *
 * 同一实现供剧情场景迁移 / 教学种子 / 设定库正文回填 / 右栏富文本正文兜底复用
 * （§9：不重复实现）。
 */
export function plainTextToDocJson(text: string): string {
  if (text.trim() === '') return ''
  const paragraphs = text
    .split(/\r?\n/)
    .map((line) =>
      line === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] }
    )
  return JSON.stringify({ type: 'doc', content: paragraphs })
}

/**
 * 富文本正文 JSON → 「段落文本数组」：卡片 / 弹窗逐段渲染用（逐段 `text-indent` 的前提）。
 *
 * 背景：`world_texts.body` / `plot_scenes.description` 派生纯文本时块级之间已用 `\n` 分隔
 * （见 `docJsonToBlockText`），但卡片仍需按行拆段才能逐段缩进两字。
 *
 * 口径（有意取舍）：
 * - **块级节点各自成段**：`paragraph` / `heading` / `listItem` / `tableCell` / `blockquote`
 *   的子段落均单独一项（列表项、表格单元格不得粘成一句）；
 * - **不保留块语义**：heading / bulletList / blockquote / table 一律按普通段落输出，
 *   卡片只有 12.5px 的窄栏，渲染标题字号 / 列表符号 / 表格会撑破版面，
 *   且展示目的只是「扫一眼正文」，故此处不做富文本排版还原；
 * - 空段（`trim()` 后为空）跳过；文档为空 → 返回空数组（调用方可回退纯文本 `body`）；
 * - 非法 JSON / 非对象 / 无 `content` 数组 → 返回空数组（不抛出，展示层按「无富文本」处理）。
 *
 * 纯函数、无依赖，可被渲染层直接打包（不得反向依赖 `src/main/**`）。
 */
export function docJsonToParagraphs(json: string): string[] {
  const blocks = parseDocBlocks(json)
  if (blocks === null) return []
  const paragraphs: string[] = []
  for (const block of blocks) collectBlockLines(block, paragraphs)
  return paragraphs
}

/**
 * 富文本正文 JSON → **带段落分隔的纯文本**（块级之间用 `\n` 连接）。
 *
 * 与 `docJsonToParagraphs` 同源同口径（等价于其 `join('\n')`），供 `body` /
 * `description` 派生使用：摘要列保留段落边界，卡片 `split('\n')` 即可逐段渲染。
 *
 * 非法 JSON / 非对象 / 无 `content` → 返回 `''`（不抛出）。
 */
export function docJsonToBlockText(json: string): string {
  return docJsonToParagraphs(json).join('\n')
}

/** 解析文档 JSON 的顶层块数组；非法 / 空串 / 无 `content` → `null`（不抛出）。 */
function parseDocBlocks(json: string): unknown[] | null {
  // 运行期宽容：调用方已在类型上限定 string，这里仍挡住 null / undefined 等脏值。
  if (typeof json !== 'string' || json.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const blocks = (parsed as { content?: unknown }).content
  return Array.isArray(blocks) ? blocks : null
}

/**
 * 块级节点类型集合：这些节点的**子块**必须各自成段，不能与相邻块粘连。
 * 行内节点（`text` / `hardBreak` / `bold` / `link` 等）不在集合内，按行内拼接。
 */
const BLOCK_NODE_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader'
])

/** 是否为块级节点（未知类型按行内处理，交由 `nodeText` 取文本）。 */
function isBlockNode(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false
  const type = (node as { type?: unknown }).type
  return typeof type === 'string' && BLOCK_NODE_TYPES.has(type)
}

/**
 * 块级节点 → 文本行（逐段推入 `out`）：
 * - 块内**行内子节点**拼成同一行；
 * - 块内**块级子节点**先 flush 当前行再递归，故 `listItem` / `tableCell` / `blockquote` 的
 *   每个子块各自成行（`bulletList` 三项 → 三行，而非「甲乙丙」一行）；
 * - 空行（`trim()` 后为空）不产出；
 * - 无 `content` 的块（空段落）不产出。
 */
function collectBlockLines(node: unknown, out: string[]): void {
  if (typeof node !== 'object' || node === null) return
  // 非块级节点（误传行内节点时的兜底）：整体文本自成一段。
  if (!isBlockNode(node)) {
    const text = nodeText(node).trim()
    if (text !== '') out.push(text)
    return
  }
  const content = (node as { content?: unknown }).content
  if (!Array.isArray(content)) return
  let line = ''
  const flush = (): void => {
    const text = line.trim()
    if (text !== '') out.push(text)
    line = ''
  }
  for (const child of content) {
    if (isBlockNode(child)) {
      flush()
      collectBlockLines(child, out)
    } else {
      line += nodeText(child)
    }
  }
  flush()
}

/**
 * 递归取节点纯文本：`text` 叶子直接返回文本；有 `content` 则拼接子节点；
 * 硬换行（`hardBreak`）折算为空格，避免段落内两行文字粘成一串。
 * 其余结构（图片 / 引用标记等）不产生文本，跳过。
 */
function nodeText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const record = node as { type?: unknown; text?: unknown; content?: unknown }
  if (typeof record.text === 'string') return record.text
  if (record.type === 'hardBreak') return ' '
  if (!Array.isArray(record.content)) return ''
  let text = ''
  for (const child of record.content) text += nodeText(child)
  return text
}
