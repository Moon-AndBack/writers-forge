/**
 * preload 类型域 · **图片**（主进程 `database/images`，`images` 表）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从主进程数据层取用，不逐字镜像
 * （理由见 `database.d.ts` 文件头——`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * 用途：大纲正文内嵌图片——正文 `content_json` 只存图片 **id**，二进制经
 * `images:get` 按 id 拉取后转 blob URL 渲染（详见 `main/ipc/images.ts` 通道契约）。
 */

import type { ImageMime, ImageRow } from '../../main/database/images'

export type { ImageMime, ImageRow }

/** 图片读取结果：`data` 为 Uint8Array（structured clone 跨 IPC 传输形式，非主进程的 Buffer）。 */
export interface ImagePayload extends ImageRow {
  data: Uint8Array
}
