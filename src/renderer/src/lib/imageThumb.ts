/**
 * 图片缩略图铸造（渲染层）：`createImageBitmap` 解码 → 长边缩到上限 →
 * `OffscreenCanvas` 重绘 → WebP 编码。
 *
 * 为什么放在渲染层：主进程没有图像解码能力（不引入 sharp 等原生依赖），
 * 而 Chromium 自带解码器与编码器；缩略图再经既有 IPC（`images:create` 的
 * `thumb` 参数 / `images:setThumb` / `books:cover:setThumb`）落库。
 *
 * 约定：返回的 `width` / `height` 是**原图**（EXIF 方向校正后）的像素尺寸，
 * 与主进程缩略图表语义一致（命中缩略图时渲染层据此 `aspect-ratio` 预留版位）。
 *
 * 所有失败路径一律返回 `null`（不抛）：缩略图是纯优化，绝不影响原图上传 / 显示。
 */

/** 缩略图长边上限：正文图 1280 / 书籍封面 640。 */
export const THUMB_MAX_EDGE = { image: 1280, cover: 640 } as const

/** WebP 编码质量。 */
export const THUMB_QUALITY = 0.8

/** 原图体积不超过此值且长边不超上限 → 无需缩略图（省一次编码）。 */
const SMALL_ORIGINAL_BYTES = 256 * 1024

/** 编码结果达到原图体积的该比例即放弃（省下的空间不值一次往返）。 */
const MIN_SAVING_RATIO = 0.9

/** 主进程缩略图体积上限（`database/images.ts` 的 `MAX_THUMB_BYTES`），超限整单被拒。 */
const MAX_THUMB_BYTES = 512 * 1024

/** 主进程允许的缩略图 mime（`THUMB_MIME_TYPES`），其余格式一律丢弃。 */
const THUMB_MIME_TYPES: readonly string[] = ['image/webp', 'image/png']

/** 主进程 `isThumbDimension` 的边长上限（原图尺寸，超限不生成，否则整单写入失败）。 */
const MAX_ORIGINAL_EDGE = 20000

/**
 * 缩略图载荷：可直接交给 `images:setThumb` / `images:create` 的 `thumb` 参数；
 * 封面域只取 `mime` + `data`（`books:cover:setThumb` 不存宽高）。
 */
export interface ThumbPayload {
  /** 编码后 mime：通常 `image/webp`；编码器不支持 WebP 时回退 `image/png`。 */
  mime: string
  /** 编码后字节数（= `data.byteLength`）。 */
  bytes: number
  /** **原图**像素宽（EXIF 方向校正后）。 */
  width: number
  /** **原图**像素高（EXIF 方向校正后）。 */
  height: number
  data: Uint8Array<ArrayBuffer>
}

/**
 * 把一份图片 Blob 缩成缩略图；不适用 / 失败时返回 `null`。
 *
 * 关键路径：
 * 1. GIF 直接跳过（单帧缩略图会丢动画）；
 * 2. `createImageBitmap(blob, { imageOrientation: 'from-image' })` —— EXIF 方向校正；
 * 3. 长边 > `maxEdge` 才缩放（等比，`round` 后至少 1px）；
 * 4. `OffscreenCanvas` + `drawImage` → `convertToBlob({ type: 'image/webp', quality: 0.8 })`；
 * 5. 编码回退 PNG 时按编码结果的 `type` 判定，非 webp / png 或体积超限则丢弃；
 * 6. 小图（≤ 256 KB 且长边已达标）与「结果 ≥ 原图 90%」都返回 `null`。
 */
export async function makeThumbFromBlob(blob: Blob, maxEdge: number): Promise<ThumbPayload | null> {
  try {
    // GIF 是多帧动图：缩略图只有一帧，宁可保留原图。
    if (blob.type === 'image/gif') return null
    if (blob.size === 0) return null
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      return null
    }

    // `from-image`：按 EXIF Orientation 校正方向后再解码（手机竖拍图不会躺着）。
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' })
    try {
      const width = bitmap.width
      const height = bitmap.height
      if (width <= 0 || height <= 0) return null
      // 主进程 `isThumbDimension` 只收 1–20000 的原图宽高，超限宁可不生成。
      if (width > MAX_ORIGINAL_EDGE || height > MAX_ORIGINAL_EDGE) return null

      const longEdge = Math.max(width, height)
      // 小图跳过：体积够小且长边已在上限内，原图直出即可。
      if (blob.size <= SMALL_ORIGINAL_BYTES && longEdge <= maxEdge) return null

      const scale = longEdge > maxEdge ? maxEdge / longEdge : 1
      const targetWidth = Math.max(1, Math.round(width * scale))
      const targetHeight = Math.max(1, Math.round(height * scale))

      const canvas = new OffscreenCanvas(targetWidth, targetHeight)
      const context = canvas.getContext('2d')
      if (!context) return null
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

      // 浏览器不支持 WebP 编码时 `convertToBlob` 静默回退 PNG，故以实际 `type` 为准。
      const encoded = await canvas.convertToBlob({ type: 'image/webp', quality: THUMB_QUALITY })
      if (!THUMB_MIME_TYPES.includes(encoded.type)) return null
      if (encoded.size === 0 || encoded.size > MAX_THUMB_BYTES) return null
      // 没省下多少体积：存两份不如直出原图。
      if (encoded.size >= blob.size * MIN_SAVING_RATIO) return null

      const data = new Uint8Array(await encoded.arrayBuffer())
      return { mime: encoded.type, bytes: data.byteLength, width, height, data }
    } finally {
      bitmap.close()
    }
  } catch {
    // 解码 / 绘制 / 编码任一环节失败都静默回退原图。
    return null
  }
}

/**
 * 从已显示的 `<img>` 生成缩略图（老图首次显示时的回填入口）。
 *
 * 经 `fetch(blob:)` 取回同一份 Blob：不联网、不复制像素，只为拿到原始体积
 * 做「小图跳过」与「≥ 90% 放弃」判断；其余流程与 `makeThumbFromBlob` 完全一致。
 */
export async function makeThumbFromImage(
  img: HTMLImageElement,
  maxEdge: number
): Promise<ThumbPayload | null> {
  try {
    const src = img.currentSrc || img.src
    if (src === '') return null
    const response = await fetch(src)
    if (!response.ok) return null
    const blob = await response.blob()
    return await makeThumbFromBlob(blob, maxEdge)
  } catch {
    return null
  }
}
