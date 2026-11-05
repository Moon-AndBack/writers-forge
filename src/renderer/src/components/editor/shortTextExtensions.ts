import { UndoRedo } from '@tiptap/extensions'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'

/**
 * 「短文本字段」轻量富文本扩展集（段落 + 文本 + 撤销重做）。
 *
 * 用途：表单里的多行短文本字段（如伏笔描述）需要**实体自动高亮**，但**不需要**块级
 * 排版能力。与通用块级底座 `RICH_TEXT_EXTENSIONS`（StarterKit 全量 + 表格 + 图片 +
 * 高亮 + 字色）刻意分开，避免把标题 / 列表 / 引用 / 代码块 / 表格 / 图片 / 链接 /
 * 加粗斜体等能力带进短字段——用户明确只需要「实体高亮」，多余能力会让文档出现
 * 非段落节点，进而破坏「描述 = 纯段落文本」的口径（卡片摘要、悬停浮窗、字数统计）。
 *
 * 包含：
 * - `Document` / `Paragraph` / `Text`：Tiptap 最小合法 schema（doc → paragraph → text），
 *   与 `docJsonToBlockText` / `plainTextToDocJson` 的段落口径一致；
 * - `UndoRedo`（Tiptap 3 的 history 扩展，替代旧 `History`）：字段内 Ctrl+Z / Ctrl+Y 可用。
 *
 * 不包含：
 * - `HardBreak`：软换行会在段内产生非文本节点，且 `docJsonToBlockText` 需额外折算；
 *   短描述用回车分段已足够；
 * - `StarterKit` 全量、`Table` / `Image` / `Heading` / `List` / `Link` / `Highlight` /
 *   `Color`：需求明确排除；
 * - `EntityHighlight`：它需要按实例注入 `bookId`（`getBookId` 闭包），由调用方以
 *   `configure` 追加到本数组之后（见 `ShortRichTextField` 的 `extensions` 选项）。
 *
 * ⚠️ 本数组为**模块级常量**：`useEditor` 按引用比对选项（见 `RICH_TEXT_EXTENSIONS`
 * 说明），调用方**不得**内联展开或每次渲染重建；需要追加扩展时在外层建
 * `useMemo` / 模块级常量数组。
 */
export const SHORT_TEXT_EXTENSIONS = [Document, Paragraph, Text, UndoRedo]

export default SHORT_TEXT_EXTENSIONS
