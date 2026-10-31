import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Tiptap doc ↔ 块级段落数组 映射工具（双格式兼容）。
 *
 * 口径：doc 的**顶层块节点**（paragraph / heading / 列表 / 表格等）与 paragraphs 表
 * 按 idx 一一对应；空段保留为 ''（不入库会丢块序）。顶层非 paragraph 的块
 * （heading / bulletList / orderedList / table 等）仅大纲编辑器启用（见 OutlineEditor），
 * 章节编辑器仍为「每段一个 paragraph」纯段落口径。
 *
 * 双格式存储（`paragraphs` 表）：
 * - `text`：该块纯文本摘要（字数统计 / 搜索的真源，不含任何格式语法）；
 * - `contentJson`：块级 Tiptap JSON 串（该块 node.toJSON() 原样序列化，marks /
 *   heading / 列表 / 表格结构天然包含）；NULL = 纯文本段（旧行为，章节侧恒 NULL）。
 *
 * 兼容：旧行 contentJson 为 NULL → 按纯文本段重建 doc（现状行为不变）。
 */

/** 段落读取项：对应 ParagraphRow 的序列化侧。 */
export interface DocParagraph {
  text: string
  contentJson: string | null
}

/** docToParagraphs 选项：`withContentJson` 开启时导出块级 JSON（大纲侧）；缺省不导出（章节侧）。 */
export interface DocToParagraphsOptions {
  withContentJson?: boolean
}

/**
 * 块级 JSON 序列化：取该顶层块 `node.toJSON()` 原样 JSON 串。
 * 空文本 paragraph 不存 JSON（与旧行为一致，纯文本段无需冗余结构）。
 */
function serializeBlockJson(node: ProseMirrorNode): string | null {
  if (node.type.name === 'paragraph' && node.textContent === '') return null
  return JSON.stringify(node.toJSON())
}

/**
 * doc → 段落数组：遍历顶层块取 text（+ 可选块级 JSON）。
 * 非 paragraph 顶层节点（heading / 列表 / 表格）text 取其全部文本内容；
 * 未启用对应扩展时不会出现此类节点（StarterKit 裁剪）。
 */
export function docToParagraphs(
  editor: Editor,
  options: DocToParagraphsOptions = {}
): DocParagraph[] {
  const withContentJson = options.withContentJson === true
  const paragraphs: DocParagraph[] = []
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'paragraph') {
      paragraphs.push({
        text: node.textContent,
        contentJson: withContentJson ? serializeBlockJson(node) : null
      })
    } else {
      // 非 paragraph 顶层块：仅大纲侧启用扩展后出现；text 取块内全部文本。
      paragraphs.push({
        text: node.textContent,
        contentJson: withContentJson ? serializeBlockJson(node) : null
      })
    }
  })
  // doc 至少一个块（Tiptap 保证文档非空），防御性兜底
  return paragraphs.length > 0 ? paragraphs : [{ text: '', contentJson: null }]
}

/** paragraphsToDocJSON 选项：`withContentJson` 开启时接受块级 JSON（大纲侧）；缺省忽略（章节侧）。 */
export interface ParagraphsToDocJSONOptions {
  withContentJson?: boolean
}

/** 块级 JSON 串 → 安全的块 JSON 对象（损坏 / 非对象 / 结构异常 → null，调用方降级纯文本段）。 */
function parseBlockJson(
  raw: string
): { type: string; content?: unknown; [key: string]: unknown } | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    const node = parsed as { type?: unknown; content?: unknown }
    if (typeof node.type !== 'string') return null
    return node as { type: string; content?: unknown; [key: string]: unknown }
  } catch {
    return null
  }
}

/**
 * 段落数组 → ProseMirror JSON：`withContentJson` 且行含块级 JSON 时按 JSON 重建
 * （heading / 列表 / 表格 / marks 一并恢复），其余按纯文本段（旧行为兼容）。
 */
export function paragraphsToDocJSON(
  paragraphs: readonly DocParagraph[],
  options: ParagraphsToDocJSONOptions = {}
): {
  type: 'doc'
  content: Array<Record<string, unknown>>
} {
  const withContentJson = options.withContentJson === true
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) => {
      if (withContentJson && paragraph.contentJson !== null && paragraph.contentJson !== '') {
        const block = parseBlockJson(paragraph.contentJson)
        if (block !== null) return block
        // JSON 损坏 → 降级为纯文本段（不丢字，仅丢结构 / 格式）
      }
      return {
        type: 'paragraph',
        ...(paragraph.text !== '' ? { content: [{ type: 'text', text: paragraph.text }] } : {})
      }
    })
  }
}

/**
 * 不计入字数的字符（Unicode 类别，`u` 标志下逐字符匹配）：
 * `\p{P}` 标点 / `\p{S}` 符号（含 emoji）/ `\p{Z}` 空白 / `\p{C}` 控制符。
 * ⚠️ 与主进程 `database/wordCount.ts` 的 `NON_COUNTABLE_CHAR` **两处须同步**
 * （20 万字单篇上限与全书字数口径唯一真源）。
 */
const NON_COUNTABLE_CHAR = /[\p{P}\p{S}\p{Z}\p{C}]/u

/**
 * 正文**有效字数**（排除标点 / 符号 / 空白 / 控制符，逐码点统计）。
 *
 * 与主进程 `countEffectiveChars`、渲染层 `docWordLimit` 的拦截判定**同口径**——
 * 脚注显示的字数、单篇上限依据、全书字数统计三者一致。基于 `text`，与块级 JSON 无关。
 */
export function countCharacters(texts: readonly string[]): number {
  let count = 0
  for (const text of texts) {
    for (const ch of text) {
      if (!NON_COUNTABLE_CHAR.test(ch)) count += 1
    }
  }
  return count
}
