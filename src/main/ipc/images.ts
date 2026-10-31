import { ipcMain } from 'electron'
import { logger } from '../logger'
import {
  createImage,
  deleteImage,
  getImage,
  isImageMime,
  MAX_IMAGE_BYTES
} from '../database/images'

/** 图片域日志 scope。 */
const log = logger.scope('images')

/** 校验正整数 id。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 二进制入参 → Buffer；支持 ArrayBuffer 与任意 TypedArray / DataView（见 `ipc/books.ts` 同款）。 */
function toBuffer(data: unknown): Buffer | null {
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

/**
 * 图片域 IPC：通道前缀 `images:`（大纲正文内嵌图片的二进制资源）。
 *
 * 通道 → 入参 / 出参（非法入参一律回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - images:create (bookId: string, mime: string, data: ArrayBuffer | Uint8Array) → ImageRow | null
 *     （写入一张图片，返回元信息行；mime 白名单 / 20 MB 上限在**本层先拦一次**，
 *      数据层 `database/images.ts` 再校验一次——双层守门；书不存在由外键约束抛错）
 * - images:get    (id: number)                                             → ImagePayload | null
 *     （`{ id, bookId, mime, bytes, createdAt, data: Uint8Array }`；`data` 显式转 Uint8Array，
 *      Buffer 会在 structured clone 中被降级且渲染层拿不到 Buffer 方法）
 * - images:delete (id: number)                                            → boolean
 *     （物理删除，不级联清理正文里的 id 引用——悬空 id 由渲染层按缺图占位容忍）
 *
 * ⚠️ `images:create` 须由调用方提供 `bookId`：图片按书隔离（删书级联删图），
 * 渲染层在大纲编辑器内已持有 `bookId`（`OutlineEditor` 的 `bookId` prop），无需从 itemId 反查。
 */
export function registerImagesIpc(): void {
  ipcMain.handle('images:create', (_event, bookId: unknown, mime: unknown, data: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') {
      log.warn('images:create bookId 非法', { bookId })
      return null
    }
    if (!isImageMime(mime)) {
      log.warn('images:create mime 不在白名单内', { bookId, mime })
      return null
    }
    const buffer = toBuffer(data)
    if (!buffer || buffer.byteLength === 0) {
      log.warn('images:create 二进制非法', { bookId, mime })
      return null
    }
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      log.warn('images:create 图片超过体积上限', {
        bookId,
        mime,
        bytes: buffer.byteLength,
        limit: MAX_IMAGE_BYTES
      })
      return null
    }
    try {
      const created = createImage({ bookId, mime, data: buffer })
      // 仅记录长度与 mime，不记录二进制内容。
      log.debug('images:create 成功', { id: created.id, bookId, mime, bytes: created.bytes })
      return created
    } catch (error) {
      log.error('images:create 失败', { bookId, mime, bytes: buffer.byteLength, error })
      throw error
    }
  })

  ipcMain.handle('images:get', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return null
    const image = getImage(id)
    if (!image) return null
    // 转 Uint8Array 以便 structured clone 跨 IPC 传输（与 books:cover:get 同款）。
    return { ...image, data: new Uint8Array(image.data) }
  })

  ipcMain.handle('images:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    try {
      const ok = deleteImage(id)
      if (ok) log.debug('images:delete 成功', { id })
      else log.warn('images:delete 未命中', { id })
      return ok
    } catch (error) {
      log.error('images:delete 失败', { id, error })
      throw error
    }
  })
}
