/**
 * preload 类型域 · **图片**（主进程 `database/images`，`images` / `image_thumbs` 表）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从主进程数据层取用，不逐字镜像
 * （理由见 `database.d.ts` 文件头——`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * 用途：大纲正文内嵌图片——正文 `content_json` 只存图片 **id**，二进制经
 * `images:getDisplay` 按 id 拉取（缩略图优先，`kind='original'` 时由渲染层回填）
 * 后转 blob URL 渲染（详见 `main/ipc/images.ts` 通道契约）。
 */

import type { ImageDisplayRow, ImageMime, ImageRow } from '../../main/database/images'

export type { ImageDisplayRow, ImageMime, ImageRow }

/** 图片读取结果：`data` 为 Uint8Array（structured clone 跨 IPC 传输形式，非主进程的 Buffer）。 */
export interface ImagePayload extends ImageRow {
  data: Uint8Array
}

/** 缩略图写入入参：`data` 跨 IPC 为 Uint8Array；宽高为**原图**像素尺寸。 */
export interface ImageThumbInput {
  mime: string
  data: Uint8Array
  width: number
  height: number
}

/**
 * 「取图」结果：`kind='thumb'` 命中缩略图（`width` / `height` 为原图尺寸），
 * `kind='original'` 表示尚未生成缩略图，渲染层据此在 `onLoad` 后回填。
 */
export interface ImageDisplayPayload {
  kind: 'thumb' | 'original'
  mime: string
  bytes: number
  width?: number
  height?: number
  data: Uint8Array
}
