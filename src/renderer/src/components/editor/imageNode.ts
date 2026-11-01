import type { Editor } from '@tiptap/core'

/**
 * 大纲正文内嵌图片 · 节点契约（渲染层唯一真源）。
 *
 * 图片节点（`image`，见 `EditorImage.ts`）在 `content_json` 里以 `attrs` 区分两类来源：
 * - **上传图**：`imageId` 为 `images` 表主键（正整数），`src` 存**稳定占位串**
 *   `wf-image://<id>`（会话无关、重启可复原）；真正的二进制经 `images:get` 按 id
 *   拉取后于渲染期转 blob URL（见 `ImageNodeView.tsx`），**落库永不含 `blob:`**。
 * - **外链图**：`imageId` 为 `null`，`src` 为 `http(s)` URL（不入库二进制）。
 *
 * 为何占位串而非空串：`content_json` 自描述（导出的 HTML / 数据可一眼看出「此图在库内」），
 * 且 `Image` 扩展的 `renderHTML` 在无 NodeView 兜底时仍能渲染出 `<img src="wf-image://id">`
 * （不产生浏览器请求，仅作占位），不会得到空 `src` 的破图。
 *
 * ⚠️ mime 白名单 / 20 MB 上限与主进程 `database/images.ts` 的 `IMAGE_MIME_TYPES` /
 * `MAX_IMAGE_BYTES` **两处须同步**（渲染层预校验避免静默失败，主进程为最后一道守门）。
 */

/** 允许的图片 mime（与主进程白名单同序同值）。 */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** 单个图片体积上限：20 MB（与主进程 `MAX_IMAGE_BYTES` 同值）。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** 上传图 `src` 的稳定占位协议前缀（非真实可请求 scheme）。 */
export const IMAGE_SRC_SCHEME = 'wf-image://'

/** 由图片 id 生成稳定占位串（上传图落库形态）。 */
export function imagePlaceholderSrc(id: number): string {
  return `${IMAGE_SRC_SCHEME}${id}`
}

/** 判定是否为本模块的稳定占位串。 */
export function isImagePlaceholder(src: unknown): boolean {
  return typeof src === 'string' && src.startsWith(IMAGE_SRC_SCHEME)
}

/** 判定上传文件的 mime 是否在白名单内。 */
export function isAllowedImageMime(type: unknown): boolean {
  return typeof type === 'string' && (IMAGE_MIME_TYPES as readonly string[]).includes(type)
}

/** 判定是否为 http / https 外链（外链图唯一允许的 `src` 形态）。 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** 插入「上传图」的内容载荷（`src` 直接写稳定占位串，绝不落 blob）。 */
export function uploadedImageContent(id: number): {
  type: 'image'
  attrs: { src: string; imageId: number; alt: null; title: null }
} {
  return {
    type: 'image',
    attrs: { src: imagePlaceholderSrc(id), imageId: id, alt: null, title: null }
  }
}

/** 插入「外链图」的内容载荷（`imageId: null`；`src` 为 http(s) URL）。 */
export function externalImageContent(src: string): {
  type: 'image'
  attrs: { src: string; imageId: null; alt: null; title: null }
} {
  return { type: 'image', attrs: { src, imageId: null, alt: null, title: null } }
}

/**
 * 落库前归一图片节点属性（见任务 6，防运行时 URL 泄漏）：
 * - `imageId` 为数字 → `src` 强制写稳定占位串（无论原值是不是 `blob:`）；
 * - `imageId` 为空且 `src` 是 `blob:` / 占位串（无主悬空）→ `src` 置 `null`；
 * - 其余（外链 URL）原样保留。
 *
 * 递归遍历 `content` / `attrs` 等任意嵌套 JSON（doc ↔ 块 ↔ 行内节点），
 * 返回**深拷贝**（不改动编辑器内文档，避免影响撤销栈 / 当前选区）。
 */
export function sanitizeOutlineContent<T>(doc: T): T {
  return sanitizeValue(doc) as T
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value === null || typeof value !== 'object') return value
  const source = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(source)) out[key] = sanitizeValue(source[key])
  if (source.type === 'image') out.attrs = sanitizeImageAttrs(out.attrs)
  return out
}

function sanitizeImageAttrs(value: unknown): Record<string, unknown> {
  const attrs = (value !== null && typeof value === 'object' ? value : {}) as Record<
    string,
    unknown
  >
  const imageId = typeof attrs.imageId === 'number' ? attrs.imageId : null
  if (imageId !== null) {
    attrs.src = imagePlaceholderSrc(imageId)
  } else if (
    typeof attrs.src === 'string' &&
    (attrs.src.startsWith('blob:') || isImagePlaceholder(attrs.src))
  ) {
    attrs.src = null
  }
  return attrs
}

/* ---------- 位置约束（任务 4） ---------- */

/** 不允许插图的原因键（映射到 i18n `format.image.<reason>`；`null` 表示允许）。 */
export type ImageBlockReason =
  | 'reasonTable'
  | 'reasonCodeBlock'
  | 'reasonHeading'
  | 'reasonList'
  | 'reasonBlock'
  | 'reasonNoBook'

/** 插图入口可用态：`editable`（编辑器可编辑）+ `reason`（不可用原因，null = 可插入）。 */
export interface ImageInsertState {
  editable: boolean
  reason: ImageBlockReason | null
}

/** 允许插图的位置判定（**仅普通段落，含引用块内段落**；表格 / 代码块 / 标题 / 列表一律禁止）。 */
export function readImageInsertState(editor: Editor): ImageInsertState {
  if (!editor.isEditable) return { editable: false, reason: 'reasonBlock' }
  if (editor.isActive('table') || editor.isActive('tableCell') || editor.isActive('tableHeader')) {
    return { editable: true, reason: 'reasonTable' }
  }
  if (editor.isActive('codeBlock')) return { editable: true, reason: 'reasonCodeBlock' }
  if (editor.isActive('heading')) return { editable: true, reason: 'reasonHeading' }
  if (
    editor.isActive('bulletList') ||
    editor.isActive('orderedList') ||
    editor.isActive('listItem')
  ) {
    return { editable: true, reason: 'reasonList' }
  }
  // 引用块内的段落仍是 paragraph：`isActive('paragraph')` 为真且上面四个禁止项均不成立 → 放行。
  if (!editor.isActive('paragraph')) return { editable: true, reason: 'reasonBlock' }
  return { editable: true, reason: null }
}
