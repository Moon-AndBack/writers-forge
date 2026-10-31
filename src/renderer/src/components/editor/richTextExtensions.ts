import type { Content } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import { TableKit } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { EditorImage } from './EditorImage'

/**
 * 块级富文本底座（大纲条目正文 / 剧情场景正文**共用**，§9：同结构同行为不重复实现）。
 *
 * StarterKit 裁剪：Tiptap 3 默认开启的能力**全部保留**——heading（H1–H6）、
 * bulletList / orderedList / listItem（列表）、blockquote（引用块）、codeBlock（代码块）、
 * horizontalRule（分隔线）、code（行内代码）、link（链接，经 StarterKit 的 `link` 选项）——
 * 块级节点经整条 JSON 持久化（`outline_items.content_json` / `plot_scenes.description_json`）。
 * 仅剔除 hardBreak / dropcursor / gapcursor（hardBreak 会在段内产生非文本节点，与「每块一个顶层节点」
 * 的块级口径冲突；dropcursor / gapcursor 为拖放辅助，两域均不提供拖放排序）。
 *
 * ⚠️ 名称/能力与「章节」编辑器（`chapters/ChaptersView.tsx`）**刻意不同**——章节正文为
 * 「每段一个 paragraph」的纯段落口径（`paragraphs` 表按段存储），故章节侧禁用了全部块级扩展，
 * 其扩展集自成一份，不复用本模块。
 *
 * ⚠️ 本数组为**模块级私有常量**：`useEditor` 的 `compareOptions` 用引用相等比对
 * （见 @tiptap/react 的 `EditorInstanceManager.compareOptions`），数组一旦每次渲染新建，
 * 就会每次 `editor.setOptions()` → `view.updateState()` → `selectionToDOM` 把 DOM Selection
 * 搬回 `.ProseMirror`，导致同页其它输入框（如大纲标题、剧情标题）中文输入法组合串被丢弃。
 * 调用方**必须**以模块级常量引用本数组（如需追加扩展，在外层建模块级常量），不得内联展开。
 */
export const RICH_TEXT_EXTENSIONS = [
  StarterKit.configure({
    hardBreak: false,
    dropcursor: false,
    gapcursor: false
  }),
  // 高亮 mark（多色）：对应标题栏「高亮」下拉按钮，颜色经 mark 的 `color` 属性存入。
  // ⚠️ 必须 `multicolor: true`，否则 `addAttributes` 返回空对象、`{ color }` 不落库
  // （见 @tiptap/extension-highlight 的 addAttributes 分支）。
  Highlight.configure({ multicolor: true }),
  // 行内文字样式基座 + 字色：对应标题栏「字色」下拉按钮。
  // TextStyle 是 text-style 家族（Color 等）的公共 mark 基座，Color 依赖它，故须先注册。
  TextStyle,
  Color,
  // 表格套件：table / tableRow / tableCell / tableHeader。
  // `resizable: true` 才启用 prosemirror-tables 的 `columnResizing` 插件（表内列宽拖拽）
  // ——Table 的 `addProseMirrorPlugins` 仅在 `options.resizable && editor.isEditable`
  // 时注入该插件（见 @tiptap/extension-table），默认 `resizable: false` 时
  // `.column-resize-handle` 永不出现。开启后 TableView 接管表格渲染
  // （`.tableWrapper` + `<colgroup>`），列宽经 `colwidth` 属性持久化。
  TableKit.configure({
    table: { resizable: true },
    tableRow: {},
    tableCell: {},
    tableHeader: {}
  }),
  // 正文内嵌图片（行内）：上传图落库只存 `imageId`（`src` 为稳定占位串），
  // 渲染期按 id 补水 blob URL；外链图直存 URL（见 components/editor/EditorImage.ts）。
  // `inline: true` —— 图片插在段落文字流内（位置约束由标题栏入口置灰实现）。
  EditorImage
]

/**
 * 空文档（无正文 / 载体缺失时占位）：`useEditor` 的 `content` **逐字恒等**要求同上，
 * 故与 `RICH_TEXT_EXTENSIONS` 一样必须是模块级恒等引用。
 */
export const EMPTY_RICH_TEXT_CONTENT: Content = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
}

/**
 * `useEditor` 选项**逐字恒等**用的模块级常量（W11 中文输入法焦点修复，原因见
 * `RICH_TEXT_EXTENSIONS` 说明）：`editorProps` 同样按引用比对，不得内联新建。
 */
export const RICH_TEXT_EDITOR_PROPS = { attributes: { spellcheck: 'false' } }

/** 把任意文本包成合法 CSS 字符串字面量，供 `content: var(--editor-placeholder)` 使用。 */
export function toCssString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** 解析库内富文本 JSON 串：合法对象原样返回，`null` / 空串 / 非法 / 非对象 → 空文档（不抛错）。 */
export function parseRichTextContent(json: string | null): Content {
  if (json === null || json.trim() === '') return EMPTY_RICH_TEXT_CONTENT
  try {
    const parsed = JSON.parse(json) as unknown
    if (typeof parsed === 'object' && parsed !== null) return parsed as Content
    return EMPTY_RICH_TEXT_CONTENT
  } catch {
    return EMPTY_RICH_TEXT_CONTENT
  }
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
 * 判定富文本 JSON 值是否为「空正文」：解析出的 doc 顶层全为**空段落**（或无内容）。
 * 用于把编辑器空文档（`{type:'doc',content:[{type:'paragraph'}]}`）归一为 `null`——
 * 与主进程 `database/richText.isEmptyRichDoc` **同口径**（渲染层提前归一，保证「保存后草稿与回写行相等」
 * 从而正确转净，避免空场景一挂载就误报 dirty）。
 *
 * ⚠️ 段落内的**非文本行内节点**（如 `image`）必须视为「有内容」：图片节点无文本，
 * 「整条正文只插图不配字」时纯文本摘要为空串，若只按顶层块类型判定，会把这种正文
 * 误判为空正文并归一为 `null`，导致图片引用随保存被抹掉。
 */
export function isEmptyRichTextValue(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') return false
  const content = (parsed as { content?: unknown }).content
  if (content === undefined) return true
  if (!Array.isArray(content)) return false
  if (content.length === 0) return true
  return content.every(isEmptyParagraphNode)
}
