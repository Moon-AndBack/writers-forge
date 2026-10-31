import Database from 'better-sqlite3'
import { getDb } from './index'

/**
 * 段落行：`idx` 为块序（0 起），`text` 为该块纯文本摘要（搜索 / 字数真源），
 * `contentJson` 为块级 Tiptap JSON 串（NULL = 纯文本段）。
 */
export interface ParagraphRow {
  id: number
  /** 所属章 id（`paragraphs.chapter_id` → `chapters.id`，外键 CASCADE；取代旧 `document_id`）。 */
  chapterId: number
  idx: number
  text: string
  contentJson: string | null
}

export interface ParagraphDbRow {
  id: number
  chapterId: number
  idx: number
  text: string
  contentJson: string | null
}

/**
 * 段落写入项：`text` 必填（字数统计 / 搜索 / 当日增量的真源）；
 * `contentJson` 为块级 Tiptap JSON 串，缺省 / null = 纯文本段
 * （章节侧维持此形态；大纲侧正文内联在 `outline_items.content_json`，不占本表）。
 */
export interface ParagraphInput {
  text: string
  contentJson?: string | null
}

/**
 * 读取某章全部段落（按 idx 升序）。该章暂无段落时返回空数组。
 *
 * 归属列由 `document_id` 改为 `chapter_id`：正文直接挂在章上，`documents` 表已删除，
 * `UNIQUE(chapter_id, idx)` 同时充当「按章取正文」的索引。
 */
export function getParagraphs(chapterId: number): ParagraphRow[] {
  const statement: Database.Statement<[number], ParagraphDbRow> = getDb().prepare(
    'SELECT id, chapter_id AS chapterId, idx, text, content_json AS contentJson FROM paragraphs WHERE chapter_id = ? ORDER BY idx ASC'
  )
  return statement.all(chapterId)
}

/**
 * 全量重写某章段落：事务内先 DELETE 该章全部段落，再按 idx 0..n-1 批量 INSERT。
 *
 * 为何全量重写而非 diff：
 * - 正篇章节数千段以内，全量重写成本可忽略，而 diff 需要段落级对齐算法，复杂度与出错面都大；
 * - 单事务保证原子性（任一步失败整体回滚，不留半截正文）；
 * - 空段（''）也占一个 idx，块序与编辑器 doc 的顶层块节点一一对应。
 *
 * `contentJson` 为块级 Tiptap JSON 串（渲染层序列化），NULL = 纯文本段；
 * 字数统计 / 搜索 / 当日增量均基于 `text`，与 contentJson 无关（text 不含任何格式语法）。
 */
export function saveParagraphs(chapterId: number, paragraphs: readonly ParagraphInput[]): number {
  const db = getDb()
  const insert = db.prepare(
    'INSERT INTO paragraphs (chapter_id, idx, text, content_json) VALUES (?, ?, ?, ?)'
  )

  const write = db.transaction((list: readonly ParagraphInput[]): number => {
    db.prepare('DELETE FROM paragraphs WHERE chapter_id = ?').run(chapterId)
    for (let index = 0; index < list.length; index += 1) {
      const item = list[index]
      insert.run(chapterId, index, item.text, item.contentJson ?? null)
    }
    return list.length
  })

  return write(paragraphs)
}
