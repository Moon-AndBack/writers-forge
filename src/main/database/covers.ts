import Database from 'better-sqlite3'
import { getDb } from './index'
import { isThumbMime, MAX_THUMB_BYTES } from './images'

/** 封面图记录：二进制以 Buffer 形式返回。 */
export interface CoverRow {
  mime: string
  data: Buffer
}

/** 封面缩略图写入入参（封面按容器裁切显示，不记宽高）。 */
export interface CoverThumbInput {
  mime: string
  data: Buffer
}

/** 「取封面」结果：缩略图优先；`kind='original'` 表示尚无缩略图，由渲染层回填。 */
export interface CoverDisplayRow {
  kind: 'thumb' | 'original'
  mime: string
  bytes: number
  data: Buffer
}

interface CoverDbRow {
  mime: string
  data: Buffer
}

interface CoverThumbDbRow {
  mime: string
  bytes: number
  data: Buffer
}

/** 读取指定书籍的封面图，不存在返回 null。 */
export function getCover(bookId: string): CoverRow | null {
  const statement: Database.Statement<[string], CoverDbRow> = getDb().prepare(
    'SELECT mime, data FROM book_covers WHERE bookId = ?'
  )
  const row = statement.get(bookId)
  if (!row) return null
  return { mime: row.mime, data: row.data }
}

/** 读取封面缩略图行（含二进制），不存在返回 null。 */
function readCoverThumb(bookId: string): CoverThumbDbRow | null {
  const row = getDb()
    .prepare('SELECT mime, bytes, data FROM book_cover_thumbs WHERE book_id = ?')
    .get(bookId) as CoverThumbDbRow | undefined
  return row ?? null
}

/**
 * 「取封面」：有缩略图返回缩略图，否则回退原图；封面不存在返回 null。
 * `kind` 即渲染层判据：只有 `original` 才需要生成并回写缩略图。
 */
export function getCoverDisplay(bookId: string): CoverDisplayRow | null {
  const thumb = readCoverThumb(bookId)
  if (thumb) return { kind: 'thumb', mime: thumb.mime, bytes: thumb.bytes, data: thumb.data }
  const cover = getCover(bookId)
  if (!cover) return null
  return { kind: 'original', mime: cover.mime, bytes: cover.data.byteLength, data: cover.data }
}

/** 封面缩略图入参守门（mime / 体积），任一不通过即抛错。 */
function assertThumb(thumb: CoverThumbInput): void {
  if (!isThumbMime(thumb.mime)) {
    throw new Error(`封面缩略图 mime 不在白名单内（${thumb.mime}）`)
  }
  const bytes = thumb.data.byteLength
  if (bytes === 0) throw new Error('封面缩略图二进制为空')
  if (bytes > MAX_THUMB_BYTES) {
    throw new Error(`封面缩略图超过 ${MAX_THUMB_BYTES} 字节上限（${bytes}）`)
  }
}

/** 覆盖写入封面缩略图（封面内容整体替换，旧缩略图必须作废）。 */
function replaceThumb(db: Database.Database, bookId: string, thumb: CoverThumbInput): void {
  db.prepare('DELETE FROM book_cover_thumbs WHERE book_id = ?').run(bookId)
  db.prepare(`INSERT INTO book_cover_thumbs (book_id, mime, bytes, data) VALUES (?, ?, ?, ?)`).run(
    bookId,
    thumb.mime,
    thumb.data.byteLength,
    thumb.data
  )
}

/**
 * 「回填」写入封面缩略图：`INSERT OR IGNORE`，已存在不覆盖（先写先得），
 * 返回是否实际写入。书不存在时由外键抛错（不留孤儿缩略图）。
 */
export function setCoverThumb(bookId: string, thumb: CoverThumbInput): boolean {
  if (typeof bookId !== 'string' || bookId === '') throw new Error('setCoverThumb: bookId 非法')
  assertThumb(thumb)
  const result = getDb()
    .prepare(
      `INSERT OR IGNORE INTO book_cover_thumbs (book_id, mime, bytes, data) VALUES (?, ?, ?, ?)`
    )
    .run(bookId, thumb.mime, thumb.data.byteLength, thumb.data)
  return Number(result.changes) > 0
}

/**
 * 写入 / 覆盖封面图（UPSERT），同步刷新 updatedAt。
 *
 * `thumb` 可选，与原图同事务写入。封面内容整体替换，旧缩略图一律作废：
 * 传 `thumb` 覆盖写，不传则删除旧缩略图（避免 `getCoverDisplay` 命中与新封面不符的缓存）。
 */
export function setCover(
  bookId: string,
  mime: string,
  data: Buffer,
  thumb?: CoverThumbInput
): void {
  if (thumb) assertThumb(thumb)
  const db = getDb()
  const write = db.transaction((): void => {
    db.prepare(
      `INSERT INTO book_covers (bookId, mime, data, updatedAt)
       VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
       ON CONFLICT(bookId) DO UPDATE SET
         mime = excluded.mime,
         data = excluded.data,
         updatedAt = strftime('%Y-%m-%d %H:%M:%f', 'now')`
    ).run(bookId, mime, data)
    if (thumb) replaceThumb(db, bookId, thumb)
    else db.prepare('DELETE FROM book_cover_thumbs WHERE book_id = ?').run(bookId)
  })
  write()
}

/** 删除封面图（连同缩略图），返回是否命中。 */
export function deleteCover(bookId: string): boolean {
  const db = getDb()
  const remove = db.transaction((): boolean => {
    const hit = db.prepare('DELETE FROM book_covers WHERE bookId = ?').run(bookId)
    db.prepare('DELETE FROM book_cover_thumbs WHERE book_id = ?').run(bookId)
    return Number(hit.changes) > 0
  })
  return remove()
}
