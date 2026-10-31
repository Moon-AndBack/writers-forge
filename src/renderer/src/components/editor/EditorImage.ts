import { Image } from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageNodeView } from './ImageNodeView'

/**
 * 大纲正文「图片」节点扩展（`@tiptap/extension-image` 定制版）。
 *
 * **`inline: true`（关键判定）**：用户要求图片插在**段落内**——块级（`inline: false`）
 * 的图片是独立顶层块，无法落在段落文字流中，也无法满足「仅普通段落 / 引用块内可插入」
 * 这一位置约束（块级位置与「段落内」互斥）。`inline: true` 时 `image` 属 `inline` 组，
 * `insertContent` 在光标处插入段内行内节点，故**位置约束可靠**：约束由渲染层按
 * `isActive('paragraph' | 'table' | ...)` 判定并置灰入口（见 `readImageInsertState`），
 * 与 ProseMirror 的 `inline` 组能力正交——即使 PM 技术上允许块内插图，入口也会按业务
 * 规则先行禁用。
 *
 * **属性**：在 `Image` 原有 `src` / `alt` / `title` / `width` / `height` 之上追加
 * `imageId`（上传图 = `images` 表主键；外链图 = null）。`imageId` 的 `renderHTML`
 * 返回空对象，**不落 DOM**（仅存 `content_json`），避免污染导出的 HTML。
 *
 * **渲染**：`addNodeView` 交给 React 节点视图（`ImageNodeView`）——上传图按 id 补水
 * blob URL、外链图直用 `src`、悬空 id 渲染缺图占位（object URL 生命周期见该组件）。
 *
 * ⚠️ 本常量为模块级（与 `EDITOR_BASE_EXTENSIONS` 的恒等性要求一致，见 OutlineEditor 说明）：
 * `Image.configure(...).extend(...)` 只在此求值一次，`useEditor` 每次渲染拿到同一引用。
 */
export const EditorImage = Image.configure({ inline: true, allowBase64: false }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      imageId: {
        default: null,
        // 仅存 JSON，不进 DOM（避免 `imageid="..."` 之类无意义属性）。
        renderHTML: () => ({})
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  }
})

export default EditorImage
