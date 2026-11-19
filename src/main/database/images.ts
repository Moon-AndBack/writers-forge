import type Database from 'better-sqlite3'
import { getDb } from './index'

/**
 * 图片资源数据层（`images` 表，见 `schema/images.ts`）。
 *
 * 职责：
 * - 图片二进制的写入 / 读取 / 删除 / 按书列举；
 * - **入参守门**：mime 白名单 + 体积上限（20 MB）在本层强制，越界**抛错**
 *   （IPC 层在调用前另做一次早退，见 `ipc/images.ts`——双层校验，本层为最后一道）；
 * - 缩略图缓存（`image_thumbs`）：写入守门（webp / png、512 KB、原图宽高 1–20000）；
 *   取图优先返回缩略图，缩略图**先写先得**（已存在不覆盖）。
 *
 * 二进制出参形态：本层返回 `Buffer`（better-sqlite3 BLOB 原生形态）；
 * **跨 IPC 传输须转 `Uint8Array`**（structured clone 会把 Buffer 降级为 Uint8Array，
 * 渲染层拿不到 Buffer 方法），转换点统一放在 `ipc/images.ts`——与 `covers.ts` 同范式。
 */

/** 允许的图片 mime 白名单（与渲染层 `File.type` 对齐；不含 svg / bmp / avif 等）。 */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const

/** 单个图片体积上限：20 MB（超出拒绝入库）。 */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

/** 缩略图允许的 mime 白名单（仅压缩友好的 webp / png）。 */
export const THUMB_MIME_TYPES = ['image/webp', 'image/png'] as const

/** 单个缩略图体积上限：512 KB（超出拒绝入库）。 */
export const MAX_THUMB_BYTES = 512 * 1024

/** 缩略图记录的**原图**像素边长上限（1–20000，与渲染层 canvas 能力对齐）。 */
const MAX_THUMB_DIMENSION = 20000

export type ImageMime = (typeof IMAGE_MIME_TYPES)[number]

export type ThumbMime = (typeof THUMB_MIME_TYPES)[number]

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

/** 缩略图写入入参（二进制须已转为 `Buffer`）。 */
export interface ThumbInput {
  mime: string
  /** 字节数由 `data.byteLength` 派生，不单独传。 */
  data: Buffer
  /** **原图**像素宽（缩略图自身按比例缩放，界面按原图尺寸排版）。 */
  width: number
  height: number
}

/** 创建图片入参（二进制须已转为 `Buffer`）。 */
export interface CreateImageInput {
  bookId: string
  mime: string
  data: Buffer
  /** 可选缩略图：与新图同事务写入。 */
  thumb?: ThumbInput
}

/**
 * 「取图」结果（缩略图优先）：
 * - `kind='thumb'`：命中缩略图，`width` / `height` 为**原图**像素尺寸；
 * - `kind='original'`：尚无缩略图，回退原图（宽高缺省，由渲染层解码后回填）。
 *
 * `kind` 即渲染层判据：只有 `original` 才需要在 `onLoad` 后生成并回写缩略图。
 */
export interface ImageDisplayRow {
  kind: 'thumb' | 'original'
  mime: string
  bytes: number
  width?: number
  height?: number
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

/** 缩略图库内行形状（含二进制）。 */
interface ThumbDbRow {
  mime: string
  bytes: number
  /** 原图像素宽高（非缩略图自身尺寸）。 */
  width: number
  height: number
  data: Buffer
}

/** 判定 mime 是否在白名单内。 */
export function isImageMime(value: unknown): value is ImageMime {
  return typeof value === 'string' && (IMAGE_MIME_TYPES as readonly string[]).includes(value)
}

/** 判定缩略图 mime 是否在白名单内（webp / png）。 */
export function isThumbMime(value: unknown): value is ThumbMime {
  return typeof value === 'string' && (THUMB_MIME_TYPES as readonly string[]).includes(value)
}

/** 判定像素边长是否合法（1–20000 的正整数）。 */
export function isThumbDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_THUMB_DIMENSION
  )
}

/** 缩略图入参守门（mime / 体积 / 原图宽高），任一不通过即抛错。 */
function assertThumb(thumb: ThumbInput): void {
  if (!isThumbMime(thumb.mime)) {
    throw new Error(`缩略图 mime 不在白名单内（${thumb.mime}）`)
  }
  const bytes = thumb.data.byteLength
  if (bytes === 0) throw new Error('缩略图二进制为空')
  if (bytes > MAX_THUMB_BYTES) {
    throw new Error(`缩略图超过 ${MAX_THUMB_BYTES} 字节上限（${bytes}）`)
  }
  if (!isThumbDimension(thumb.width) || !isThumbDimension(thumb.height)) {
    throw new Error(`缩略图记录的原图宽高非法（${thumb.width}x${thumb.height}）`)
  }
}

/**
 * 写入缩略图（`INSERT OR IGNORE`：已存在不覆盖，先写先得）。
 * 返回是否实际写入（重复写入 / 已被并发写入 → false）。
 * 图片不存在时由外键约束抛错（缩略图不允许孤儿行）。
 */
function insertThumb(db: Database.Database, imageId: number, thumb: ThumbInput): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO image_thumbs (image_id, mime, bytes, width, height, data)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(imageId, thumb.mime, thumb.data.byteLength, thumb.width, thumb.height, thumb.data)
  return Number(result.changes) > 0
}

/**
 * 写入一张图片，返回新建的行（元信息，不含二进制）。
 *
 * 校验（任一不通过即抛错，不落库）：
 * - `bookId` 非空白字符串；
 * - `mime` 在白名单内；
 * - `data` 非空且 `byteLength <= MAX_IMAGE_BYTES`；
 * - 可选 `thumb` 满足缩略图守门（见 `assertThumb`）；
 * - 书存在（由 `book_id` 外键 + `foreign_keys = ON` 兜底，删书级联）。
 *
 * 主图与缩略图**同事务**写入：缩略图失败则整条回滚，不留无缩略图的半成品。
 */
export function createImage(input: CreateImageInput): ImageRow {
  const { bookId, mime, data, thumb } = input
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
  if (thumb) assertThumb(thumb)

  const db = getDb()
  const write = db.transaction((): number => {
    const result = db
      .prepare('INSERT INTO images (book_id, mime, bytes, data) VALUES (?, ?, ?, ?)')
      .run(bookId, mime, bytes, data)
    const id = Number(result.lastInsertRowid)
    // 新图 id 首次出现，OR IGNORE 不会命中冲突（与 `setImageThumb` 共用写入函数）。
    if (thumb) insertThumb(db, id, thumb)
    return id
  })
  const row = readImageMeta(write())
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

/** 读取缩略图行（含二进制），不存在返回 null。 */
function readThumb(imageId: number): ThumbDbRow | null {
  const row = getDb()
    .prepare('SELECT mime, bytes, width, height, data FROM image_thumbs WHERE image_id = ?')
    .get(imageId) as ThumbDbRow | undefined
  return row ?? null
}

/**
 * 「取图」：有缩略图返回缩略图，否则回退原图；图片不存在返回 null。
 *
 * 缩略图命中也回传**原图**宽高（缩略图铸造时记下），渲染层据此直接排版，
 * 不必等缩略图解码；`kind='original'` 时宽高缺省，由渲染层 `onLoad` 回填。
 */
export function getImageDisplay(id: number): ImageDisplayRow | null {
  const thumb = readThumb(id)
  if (thumb) {
    return {
      kind: 'thumb',
      mime: thumb.mime,
      bytes: thumb.bytes,
      width: thumb.width,
      height: thumb.height,
      data: thumb.data
    }
  }
  const image = getImage(id)
  if (!image) return null
  return { kind: 'original', mime: image.mime, bytes: image.bytes, data: image.data }
}

/**
 * 写入图片缩略图：`INSERT OR IGNORE`，已存在不覆盖（先写先得），返回是否实际写入。
 * 图片不存在时由外键抛错（不留孤儿缩略图）。
 */
export function setImageThumb(id: number, thumb: ThumbInput): boolean {
  if (!Number.isInteger(id) || id <= 0) throw new Error('setImageThumb: id 非法')
  assertThumb(thumb)
  return insertThumb(getDb(), id, thumb)
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
