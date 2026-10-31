import { docJsonToBlockText, plainTextToDocJson } from '../../shared/richTextDoc'

/**
 * 富文本（块级 Tiptap JSON）通用工具：主进程侧共用的「JSON ↔ 纯文本摘要」转换与归一化。
 *
 * 大纲域（`outline_items.content_json` + `text`）与剧情域（`plot_scenes.description_json` +
 * `description`）**同一存储 / 序列化口径**：
 * - 正文以**整条块级 Tiptap JSON 串**存储（独立 TEXT 列，`null` = 空正文，取代「每段一行」）；
 * - 另存一列**派生纯文本摘要**（字数 / 搜索 / 卡片摘要的真源，完整含标点、不裁剪，
 *   **块级之间用 `\n` 分隔**以保留段落边界）。
 *
 * 本模块即两域的公共实现（§9：同结构 / 同行为不重复实现）：空正文判定、
 * JSON 归一化、纯文本包文档、IPC 入参校验集中于此；摘要派生委托共享层
 * `docJsonToBlockText`（与渲染层正文编辑器同口径）。
 */

/**
 * 由块级 JSON 派生纯文本摘要：块级之间用 `\n` 分隔（段落边界保留，供卡片拆段）。
 *
 * 实现委托 `src/shared/richTextDoc.ts` 的 `docJsonToBlockText`（§9：与渲染层
 * `readRichTextBody` 同口径，避免主进程 / 渲染层两套派生行为漂移）。
 *
 * **非法 JSON / 非对象 → 返回空串，不抛错**（摘要派生是尽力而为，坏数据不应中断写入链路）。
 * 结果为**完整纯文本（含标点）**：标点只在字数统计口径排除，此处不裁剪。
 */
export function derivePlainText(raw: string): string {
  return docJsonToBlockText(raw)
}

/** 判定单个顶层块是否为「空段落」：`paragraph` 且无子节点 / 子节点全为空文本节点。 */
function isEmptyParagraphNode(node: unknown): boolean {
  if (node === null || typeof node !== 'object') return false
  const { type, content } = node as { type?: unknown; content?: unknown }
  if (type !== 'paragraph') return false
  if (content === undefined) return true
  if (!Array.isArray(content)) return false
  return content.every((child) => {
    if (child === null || typeof child !== 'object') return false
    const { type: childType, text } = child as { type?: unknown; text?: unknown }
    return childType === 'text' && (text === undefined || text === '')
  })
}

/**
 * 判定「空正文」：解析出的 doc 顶层全为**空段落**（或无内容）。
 * 用于把编辑器空文档（`{type:'doc',content:[{type:'paragraph'}]}`）归一为 `NULL`。
 *
 * ⚠️ 段落内的**非文本行内节点**（如 `image`）必须视为「有内容」：图片节点无文本，
 * 「整条正文只插图不配字」时纯文本摘要为空串，若只按顶层块类型判定，会把这种正文
 * 误判为空正文并归一为 `NULL`，导致图片引用随保存被抹掉。
 *
 * 非法 JSON / 非对象 → 视为「非空」（保留原值，交由 JSON 校验拦截）。
 */
export function isEmptyRichDoc(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') return false
  const content = (parsed as { content?: unknown }).content
  if (content === undefined) return true
  if (!Array.isArray(content)) return false
  if (content.length === 0) return true
  return content.every(isEmptyParagraphNode)
}

/**
 * 归一化待落库的富文本 JSON：
 * - `null` / 空白串 → `null`（清空正文）；
 * - 非空须为**合法 JSON**（非法提前抛错给出清晰信息，避免脏数据落库）；
 * - **空正文**（顶层全为空段落）→ 归 `null`（保持「空正文 = NULL」不变式）。
 */
export function normalizeRichTextJson(contentJson: string | null): string | null {
  if (contentJson === null) return null
  const trimmed = contentJson.trim()
  if (trimmed === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('normalizeRichTextJson: contentJson 非法 JSON')
  }
  if (isEmptyRichDoc(parsed)) return null
  return contentJson
}

/**
 * 纯文本 → 合法富文本文档 JSON 串：实现位于 `src/shared/richTextDoc.ts`
 * （主进程回填 / 种子与渲染层设定库正文兜底共用，§9；渲染层不得反向依赖 `src/main/**`）。
 * 本模块再导出，既有导入路径（`./richText`）保持不变。
 */
export { plainTextToDocJson }

/**
 * 纯文本 → 合法富文本文档 JSON（按行拆为多个 `paragraph`）；空白 → `null`（空正文）。
 * 用于把既有纯文本正文（剧情场景旧数据 / 教学种子 / 纯文本表单）包成合法富文本文档。
 */
export function wrapPlainTextToDoc(text: string): string | null {
  const json = plainTextToDocJson(text)
  return json === '' ? null : json
}

/**
 * 校验 IPC 入参富文本 JSON：`null` / 空串 = 清空正文；非空须为**合法 JSON 串**。
 *
 * 主进程复验一次 `JSON.parse`：数据层会再归一化，但非法串应提前拦截，
 * 避免以底层错误污染正文写入链路（且报错信息不可读）。
 */
export function isValidRichTextJson(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return true
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}
