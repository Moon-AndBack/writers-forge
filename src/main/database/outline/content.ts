import { getDb } from '../index'
import { NOW } from '../chapterGroups'
import { derivePlainText, isEmptyRichDoc } from '../richText'
import { OUTLINE_ITEM_COLUMNS, toOutlineItem } from './types'
import type { OutlineItemDbRow, OutlineItemRow } from './types'

/**
 * 大纲域正文链路（新结构：正文**整条内联**在 `outline_items.content_json`，
 * 取代旧「每行关联 `documents` + `paragraphs` 分段落库」）。
 *
 * 三类读取：
 * - `getOutlineItem`：按行 id 取整行（条目 / 卷纲行通用）；
 * - `getOutlineContent`：按行 id 取正文载荷（`contentJson` + `text`），**条目 / 卷纲通用**
 *   （渲染层「点开条目」与「点开卷」都先拿到载体行 id 再读正文）；
 * - `getOutlineVolumeContent`：按**卷 id** 取该卷卷纲行（`scope='volume'`）正文载荷。
 *
 * `text` 为**完整纯文本（含标点）**：它是搜索匹配的真源（带标点的原文片段须能命中），
 * 标点只在**字数统计**口径（`countEffectiveChars`）才排除，此处**不得裁剪**。
 */

/** 正文载荷：`contentJson` = 块级 JSON（`null` = 空正文）；`text` = 派生纯文本摘要。
 *  `updatedAt` = 行 `updated_at`（SQLite UTC 文本），供编辑头「最后编辑」相对时间展示。 */
export interface OutlineContentPayloadRow {
  id: number
  contentJson: string | null
  text: string
  updatedAt: string
}

/** 按 id 取整行（条目 / 卷纲行通用），不存在返回 null。 */
export function getOutlineItem(id: number): OutlineItemRow | null {
  const row = getDb()
    .prepare(`SELECT ${OUTLINE_ITEM_COLUMNS} FROM outline_items WHERE id = ?`)
    .get(id) as OutlineItemDbRow | undefined
  return row ? toOutlineItem(row) : null
}

/**
 * 按行 id 取正文载荷（**条目 / 卷纲行通用**）：仅未软删行返回，否则 null。
 * 不按 `scope` 过滤——渲染层点开条目（`scope='entry'`）或卷（`scope='volume'`）都以行 id 读取。
 */
export function getOutlineContent(itemId: number): OutlineContentPayloadRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, content_json AS contentJson, text, updated_at AS updatedAt FROM outline_items
       WHERE id = ? AND deleted_at IS NULL`
    )
    .get(itemId) as OutlineContentPayloadRow | undefined
  return row ?? null
}

/**
 * 按**卷 id** 取该卷卷纲行（`scope='volume'`）正文载荷；无卷纲行 / 已软删 / 卷不存在 → null。
 * 与 `volumes` 侧无关——「卷是否有卷纲」以卷纲行是否存在为判据（部分唯一索引保证每卷至多一条）。
 */
export function getOutlineVolumeContent(volumeId: number): OutlineContentPayloadRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, content_json AS contentJson, text, updated_at AS updatedAt FROM outline_items
       WHERE volume_id = ? AND scope = 'volume' AND deleted_at IS NULL`
    )
    .get(volumeId) as OutlineContentPayloadRow | undefined
  return row ?? null
}

/**
 * 判定「空正文」：`contentJson` 解析出的 doc 顶层全为**空段落**（或无内容）。
 * 用于把编辑器空文档（`{type:'doc',content:[{type:'paragraph'}]}`）归一为 `content_json = NULL`。
 *
 * ⚠️ 段落内的**非文本行内节点**（如 `image`）必须视为「有内容」：图片节点无文本，
 * 「整条正文只插图不配字」时 `text`（`doc.textContent`）为**空串**，若只按顶层块类型判定，
 * 会把这种正文误判为空正文并归一为 `NULL`，导致图片引用随保存被抹掉。
 *
 * 实现委托公共模块 `database/richText`（§9：与剧情域共用同一判定）。
 */
function isEmptyParagraphDoc(parsed: unknown): boolean {
  return isEmptyRichDoc(parsed)
}

/**
 * 归一化待落库的 `contentJson`：
 * - `null` / 空白串 → `null`（清空正文）；
 * - 非空须为**合法 JSON**（`schema/outlineItems.ts` 的 `CHECK json_valid` 守卫，提前抛错给出清晰信息）；
 * - **空正文**（`text === ''` 且顶层全为**空段落**）→ 归 `null`（保持「空正文 = NULL」不变式）。
 */
function normalizeContentJson(contentJson: string | null, text: string): string | null {
  if (contentJson === null) return null
  const trimmed = contentJson.trim()
  if (trimmed === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('saveOutlineContent: contentJson 非法 JSON')
  }
  if (text === '' && isEmptyParagraphDoc(parsed)) return null
  return contentJson
}

/**
 * 保存正文载荷：**同一事务**写 `content_json` + `text` + `updated_at`（条目 / 卷纲行通用，
 * 仅未软删行可写）。写入前归一化 `contentJson`（见 `normalizeContentJson`）。
 * 行不存在 / 已软删 → false（不建行、不抛错）。
 */
export function saveOutlineContent(
  itemId: number,
  contentJson: string | null,
  text: string
): boolean {
  const db = getDb()
  const finalJson = normalizeContentJson(contentJson, text)
  return db.transaction((): boolean => {
    const result = db
      .prepare(
        `UPDATE outline_items SET content_json = ?, text = ?, updated_at = ${NOW}
         WHERE id = ? AND deleted_at IS NULL`
      )
      .run(finalJson, text, itemId)
    return Number(result.changes) > 0
  })()
}

/**
 * 由块级 JSON 派生纯文本摘要：递归 `content[]`，凡 `text` 为字符串的节点即取值拼接
 * （对 `paragraph` / `heading` / `bulletList` / `orderedList` / `table` 及任意嵌套均有效）。
 *
 * **非法 JSON / 非对象 → 返回空串，不抛错**（摘要派生是尽力而为，坏数据不应中断写入链路）。
 * 结果为**完整纯文本（含标点）**：标点只在字数统计口径排除，此处不裁剪。
 *
 * 实现委托公共模块 `database/richText`（§9：与剧情域共用同一派生逻辑）。
 */
export function deriveOutlineText(raw: string): string {
  return derivePlainText(raw)
}
