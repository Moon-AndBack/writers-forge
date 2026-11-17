import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model'

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
 *   heading / 列表 / 表格结构天然包含）；NULL = 无格式纯文本段（稀疏化：普通段落不写，
 *   控制库体积）。
 *
 * 兼容：旧行 contentJson 为 NULL → 按纯文本段重建 doc（与旧行为逐字一致）。
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
 * 段落块是否「无格式纯文本」：子节点全为无 mark 的 text。
 * 空段（无子节点）与仅空 text 的段落同样视为纯文本，用于稀疏化——普通段落不写 JSON。
 */
function isPlainTextParagraph(node: ProseMirrorNode): boolean {
  if (node.type.name !== 'paragraph') return false
  let plain = true
  node.forEach((child) => {
    if (child.type.name !== 'text' || child.marks.length > 0) plain = false
  })
  return plain
}

/**
 * 块级 JSON 序列化：取该顶层块 `node.toJSON()` 原样 JSON 串。
 * 无格式纯文本 paragraph（含空段）返回 null，避免普通段落产生冗余 JSON；
 * heading / 列表等非 paragraph 块与含 marks 的段落原样序列化。
 */
function serializeBlockJson(node: ProseMirrorNode): string | null {
  if (isPlainTextParagraph(node)) return null
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
  /**
   * 编辑器 schema：传入后对块级 JSON 做安全校验（见 `isSafeBlock`），不合格回退纯文本段。
   * 章节侧必须传入 `editor.schema`；不传则维持旧行为（仅做 JSON 解析，结构风险由调用方承担）。
   */
  schema?: Schema
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
 * 块级 JSON 是否可安全交给编辑器（仅在传入 schema 时启用）：
 * - 必须为 paragraph：章节编辑器禁用 heading / 列表等块级扩展，非 paragraph 会让
 *   `setContent` 解析失败并回退空文档（整章正文丢失）；
 * - `schema.nodeFromJSON` 必须成功：marks / 属性不被当前 schema 支持时即抛错；
 * - 重建后 `textContent` 必须与 `text` 一致：防止陈旧 JSON 把查找替换后的文字顶回去。
 *
 * 不传 schema → 恒 true（向后兼容：行为与改动前完全一致）。
 */
function isSafeBlock(
  block: { type: string; content?: unknown; [key: string]: unknown },
  text: string,
  schema: Schema | undefined
): boolean {
  if (schema === undefined) return true
  if (block.type !== 'paragraph') return false
  try {
    return schema.nodeFromJSON(block).textContent === text
  } catch {
    return false
  }
}

/**
 * 段落数组 → ProseMirror JSON：`withContentJson` 且行含块级 JSON 时按 JSON 重建
 * （heading / 列表 / 表格 / marks 一并恢复），其余按纯文本段（旧行为兼容）。
 * 传入 `schema` 时，非 paragraph / schema 不识别 / 文本与 `text` 不一致的 JSON 一律
 * 降级为纯文本段（不丢字，仅丢结构 / 格式）。
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
        if (block !== null && isSafeBlock(block, paragraph.text, options.schema)) return block
        // JSON 损坏 / 结构不被 schema 支持 / 文本过期 → 降级为纯文本段（不丢字，仅丢格式）
      }
      return {
        type: 'paragraph',
        ...(paragraph.text !== '' ? { content: [{ type: 'text', text: paragraph.text }] } : {})
      }
    })
  }
}

/**
 * 正文**有效字数**（排除标点 / 符号 / 空白 / 控制符，逐码点统计）。
 *
 * 口径真源在 `src/shared/wordCount.ts`（与主进程共用）；此处按渲染层既有名称
 * `countCharacters` 重导出，`docWordLimit` / 回收站详情等调用点零改动。
 * 基于 `text`，与块级 JSON 无关。
 */
export { countEffectiveChars as countCharacters } from '../../../../../shared/wordCount'
