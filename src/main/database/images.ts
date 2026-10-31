import type Database from 'better-sqlite3'
import { getDb } from './index'

/**
 * 图片资源数据层（`images` 表，见 `schema/images.ts`）。
 *
 * 职责：
 * - 图片二进制的写入 / 读取 / 删除 / 按书列举；
 * - **入参守门**：mime 白名单 + 体积上限（20 MB）在本层强制，越界**抛错**
 *   （IPC 层在调用前另做一次早退，见 `ipc/images.ts`——双层校验，本层为最后一道）。
 *
 * 二进制出参形态：本层返回 `Buffer`（better-sqlite3 BLOB 原生形态）；
 * **跨 IPC 传输须转 `Uint8Array`**（structured clone 会把 Buffer 降级为 Uint8Array，
 * 渲染层拿不到 Buffer 方法），转换点统一放在 `ipc/images.ts`——与 `covers.ts` 同范式。
 */

/** 允许的图片 mime 白名单（与渲染层 `File.type` 对齐；不含 svg / bmp / avif 等）。 */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** 单个图片体积上限：20 MB（超出拒绝入库）。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export type ImageMime = (typeof IMAGE_MIME_TYPES)[number]

/** 图片元信息行（不含二进制，供列表 / 校验使用）。 */
export interface ImageRow {
  id: number
  /** 归属书 id。 */
  bookId: string
  mime: ImageMime
  /** 二进制字节数（与 `data` 实际长度一致）。 */
  bytes: number
  createdAt: string
}

/** 图片完整行（含二进制，`Buffer` 为 better-sqlite3 原生 BLOB 形态）。 */
export interface ImagePayloadRow extends ImageRow {
  data: Buffer
}

/** 创建图片入参（二进制须已转为 `Buffer`）。 */
export interface CreateImageInput {
  bookId: string
  mime: string
  data: Buffer
}

/** 库内行形状（snake_case）。 */
interface ImageDbRow {
  id: number
  bookId: string
  mime: string
  bytes: number
  createdAt: string
}

/** 判定 mime 是否在白名单内。 */
export function isImageMime(value: unknown): value is ImageMime {
  return typeof value === 'string' && (IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

/**
 * 写入一张图片，返回新建的行（元信息，不含二进制）。
 *
 * 校验（任一不通过即抛错，不落库）：
 * - `bookId` 非空白字符串；
 * - `mime` 在白名单内；
 * - `data` 非空且 `byteLength <= MAX_IMAGE_BYTES`；
 * - 书存在（由 `book_id` 外键 + `foreign_keys = ON` 兜底，删书级联）。
 */
export function createImage(input: CreateImageInput): ImageRow {
  const { bookId, mime, data } = input
  if (typeof bookId !== 'string' || bookId.trim() === '') {
    throw new Error('createImage: bookId 非法')
  }
  if (!isImageMime(mime)) {
    throw new Error(`createImage: mime 不在白名单内（${mime}）`)
  }
  const bytes = data.byteLength
  if (bytes === 0) throw new Error('createImage: 图片二进制为空')
  if (bytes > MAX_IMAGE_BYTES) {
    throw new Error(`createImage: 图片超过 ${MAX_IMAGE_BYTES} 字节上限（${bytes}）`)
  }

  const result = getDb()
    .prepare('INSERT INTO images (book_id, mime, bytes, data) VALUES (?, ?, ?, ?)')
    .run(bookId, mime, bytes, data)
  const row = readImageMeta(Number(result.lastInsertRowid))
  if (!row) throw new Error('createImage: 写入后回读失败')
  return row
}

/** 读取图片元信息（不回传二进制），不存在返回 null。 */
function readImageMeta(id: number): ImageRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, book_id AS bookId, mime, bytes, created_at AS createdAt
       FROM images WHERE id = ?`
    )
    .get(id) as ImageDbRow | undefined
  return row ? toImageRow(row) : null
}

/** 读取图片完整载荷（含二进制 `Buffer`），不存在返回 null。 */
export function getImage(id: number): ImagePayloadRow | null {
  const statement: Database.Statement<[number], ImageDbRow & { data: Buffer }> = getDb().prepare(
    `SELECT id, book_id AS bookId, mime, bytes, created_at AS createdAt, data
     FROM images WHERE id = ?`
  )
  const row = statement.get(id)
  if (!row) return null
  return { ...toImageRow(row), data: row.data }
}

/** 物理删除图片，返回是否命中。 */
export function deleteImage(id: number): boolean {
  const result = getDb().prepare('DELETE FROM images WHERE id = ?').run(id)
  return Number(result.changes) > 0
}

/** 列举某本书的全部图片元信息（id 升序），不含二进制。 */
export function listImages(bookId: string): ImageRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, book_id AS bookId, mime, bytes, created_at AS createdAt
       FROM images WHERE book_id = ? ORDER BY id ASC`
    )
    .all(bookId) as ImageDbRow[]
  return rows.map(toImageRow)
}

/** 库内行 → 接口行：mime 写入侧已强制白名单，此处仅把 `string` 收窄为白名单联合。 */
function toImageRow(row: ImageDbRow): ImageRow {
  return {
    id: row.id,
    bookId: row.bookId,
    mime: row.mime as ImageMime,
    bytes: row.bytes,
    createdAt: row.createdAt
  }
}
