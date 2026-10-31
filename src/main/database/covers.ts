import Database from 'better-sqlite3'
import { getDb } from './index'

/** 封面图记录：二进制以 Buffer 形式返回。 */
export interface CoverRow {
  mime: string
  data: Buffer
}

interface CoverDbRow {
  mime: string
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

/** 写入 / 覆盖封面图（UPSERT），同步刷新 updatedAt。 */
export function setCover(bookId: string, mime: string, data: Buffer): void {
  getDb()
    .prepare(
      `INSERT INTO book_covers (bookId, mime, data, updatedAt)
       VALUES (?, ?, ?, strftime('%Y-%m-%d %H:%M:%f', 'now'))
       ON CONFLICT(bookId) DO UPDATE SET
         mime = excluded.mime,
         data = excluded.data,
         updatedAt = strftime('%Y-%m-%d %H:%M:%f', 'now')`
    )
    .run(bookId, mime, data)
}

/** 删除封面图，返回是否命中。 */
export function deleteCover(bookId: string): boolean {
  const result = getDb().prepare('DELETE FROM book_covers WHERE bookId = ?').run(bookId)
  return Number(result.changes) > 0
}
