/**
 * 段落匹配结果缓存（渲染进程）。
 *
 * 目的：`entities:match` 按段落调用；编辑只影响少数段落，未变更段落若命中缓存即可
 * **跳过 IPC**（整篇重匹配 / 相邻段兜底重算时收益最大）。
 *
 * 键：`书籍 id + 词表版本(revision) + 段落文本`。词表版本来自主进程
 * `entities:revision`（= `getEntityRevision` 签名，取统一设定库主表），实体 / 别名变更即整体失效。
 *
 * 失效与内存：版本变化时该书的缓存整体重建；每本书按 LRU 上限（`MAX_ENTRIES_PER_BOOK`）
 * 淘汰最久未用条目；书籍数亦有上限（`MAX_BOOKS`），避免长期多书驻留。
 */

/** 单本书的缓存：绑定构建时的词表版本。 */
interface BookCache<T> {
  revision: string
  /** 段落文本 → 匹配结果；Map 插入序即 LRU 序（命中 / 写入时移到队尾）。 */
  entries: Map<string, T>
}

/** 每本书的段落条目上限（LRU 淘汰）。 */
const MAX_ENTRIES_PER_BOOK = 1200

/** 缓存保留的书籍数上限（LRU 淘汰整本书缓存）。 */
const MAX_BOOKS = 8

/** 按「书 + 词表版本 + 段落文本」缓存段落匹配结果。 */
export class ParagraphMatchCache<T> {
  private readonly books = new Map<string, BookCache<T>>()

  /** 命中返回结果并刷新 LRU；未命中（含版本不符）返回 `undefined`。 */
  get(bookId: string, revision: string, text: string): T | undefined {
    const book = this.books.get(bookId)
    if (!book || book.revision !== revision) return undefined
    const value = book.entries.get(text)
    if (value === undefined) return undefined
    // 刷新 LRU：删除后重插到队尾。
    book.entries.delete(text)
    book.entries.set(text, value)
    return value
  }

  /** 写入结果；版本变化时整书重建（旧版本条目一并丢弃）。 */
  set(bookId: string, revision: string, text: string, value: T): void {
    let book = this.books.get(bookId)
    if (!book || book.revision !== revision) {
      book = { revision, entries: new Map<string, T>() }
      // 重建视为最近使用：移到队尾。
      this.books.delete(bookId)
      this.books.set(bookId, book)
      this.evictBooks()
    }
    book.entries.delete(text)
    book.entries.set(text, value)
    while (book.entries.size > MAX_ENTRIES_PER_BOOK) {
      const oldest = book.entries.keys().next().value
      if (oldest === undefined) break
      book.entries.delete(oldest)
    }
  }

  /** 书籍数超限时淘汰最久未用的整书缓存。 */
  private evictBooks(): void {
    while (this.books.size > MAX_BOOKS) {
      const oldest = this.books.keys().next().value
      if (oldest === undefined) break
      this.books.delete(oldest)
    }
  }
}
