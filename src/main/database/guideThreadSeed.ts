import { getDb } from './index'
import { createForeshadow, setForeshadowAbandoned, updateForeshadow } from './foreshadows'
import type { ForeshadowBodyAnchor, ForeshadowOutlineAnchor } from './foreshadows'
import { createInspiration } from './inspirations'
import { deleteSetting, getSetting, setSetting } from './settings'
import { GUIDE_FORESHADOWS, GUIDE_INSPIRATIONS } from './seedGuideBook'
import type { SeedForeshadowBodyAnchor, SeedForeshadowOutlineAnchor } from './seedGuideBook'
import { logger } from '../logger'

/**
 * 教学书**伏笔与灵感示范数据**的播种流程（数据在 `seedGuideBook/threads.ts`）。
 *
 * 与 `worldEntitySeed.ts` 同模式：按书标记 `guideThreads:seeded:<bookId>` 守卫；
 * 标记缺失但已有行（老库补种 / 标记被清）时**先按书物理清空再重播**，避免重复。
 * `chapterSeed.ts` 的教学书重灌会先 `clearGuideThreadSeedMarker` 再调用本函数，
 * 使示范数据与教学文案同步刷新；`database/index.ts` 在启动时对教学书调用一次，
 * 覆盖「重灌键已置位但伏笔 / 灵感标记缺失」的老库（不需要升 `CHAPTER_SEED_VERSION`）。
 *
 * 锚点**不硬编码段号**：按「卷名 + 章名 + 关键字」（正文）/「条目名 + 关键字」（大纲）
 * 查库解析成快照（`paragraphIdx` + `quote` + 字符区间，口径与渲染层 `paragraphAnchor`
 * 一致）。找不到只留空该槽位 + 告警，不中断播种——未锚定伏笔本身完全合法。
 */

/** 章节种子域日志 scope。 */
const log = logger.scope('guideThreadSeed')

/** 按书播种标记的 settings key。 */
function seedMarkerKey(bookId: string): string {
  return `guideThreads:seeded:${bookId}`
}

/**
 * 清除指定书籍的伏笔 / 灵感播种标记。
 *
 * 调用点：`chapterSeed.ts` 的教学书重灌事务。删除后 `seedGuideThreads` 自然走
 * 「先物理清空、后按新文案重播」分支，与演示实体标记同语义。
 */
export function clearGuideThreadSeedMarker(bookId: string): void {
  deleteSetting(seedMarkerKey(bookId))
}

/** 在块文本中定位关键字，返回段内字符区间（找不到 → null）。 */
function sliceNeedle(quote: string, needle: string): { charStart: number; charEnd: number } | null {
  const start = quote.indexOf(needle)
  if (start < 0) return null
  return { charStart: start, charEnd: start + needle.length }
}

/**
 * 解析正文锚点：按「卷名 + 章名」定位未删除章，取**首个**含关键字的段落。
 * 段序即 `paragraphs.idx`（= 文档顶层块序号）；`quote` 取该段纯文本摘要
 * （章节编辑器把非 paragraph 块降级为文本段，文本仍是 `text` 列）。
 */
function resolveChapterAnchor(
  bookId: string,
  spec: SeedForeshadowBodyAnchor
): ForeshadowBodyAnchor | null {
  const row = getDb()
    .prepare(
      `SELECT c.id AS chapterId, p.idx AS paragraphIdx, p.text AS text
       FROM chapters c
       JOIN volumes v ON v.id = c.volume_id
       JOIN paragraphs p ON p.chapter_id = c.id
       WHERE c.book_id = ? AND c.deleted_at IS NULL AND v.deleted_at IS NULL
         AND v.title = ? AND c.title = ? AND instr(p.text, ?) > 0
       ORDER BY p.idx ASC
       LIMIT 1`
    )
    .get(bookId, spec.volumeTitle, spec.chapterTitle, spec.needle) as
    { chapterId: number; paragraphIdx: number; text: string } | undefined
  if (!row) return null
  const range = sliceNeedle(row.text, spec.needle)
  if (!range) return null
  return {
    kind: 'chapter',
    chapterId: row.chapterId,
    paragraphIdx: row.paragraphIdx,
    quote: row.text,
    ...range
  }
}

/** 块级节点 → 纯文本（与 ProseMirror `node.textContent` 同口径：text 叶子取文本，其余递归拼接）。 */
function blockText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return ''
  const record = node as { text?: unknown; content?: unknown }
  if (typeof record.text === 'string') return record.text
  if (!Array.isArray(record.content)) return ''
  let text = ''
  for (const child of record.content) text += blockText(child)
  return text
}

/** 解析大纲正文的顶层块数组（坏 JSON / 非对象 → 空数组，不抛错）。 */
function readOutlineBlocks(contentJson: string | null): unknown[] {
  if (typeof contentJson !== 'string' || contentJson.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(contentJson)
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const content = (parsed as { content?: unknown }).content
  return Array.isArray(content) ? content : []
}

/**
 * 解析大纲锚点：按条目名定位未删除条目，取**首个**含关键字的顶层块。
 * `paragraphIdx` 是该块在 `content_json` 的顶层下标（大纲正文整条内联）。
 */
function resolveOutlineAnchor(
  bookId: string,
  spec: SeedForeshadowOutlineAnchor
): ForeshadowOutlineAnchor | null {
  const row = getDb()
    .prepare(
      `SELECT id AS outlineItemId, content_json AS contentJson
       FROM outline_items
       WHERE book_id = ? AND deleted_at IS NULL AND kind = 'entry' AND scope = 'entry'
         AND title = ?
       ORDER BY id ASC
       LIMIT 1`
    )
    .get(bookId, spec.itemTitle) as
    { outlineItemId: number; contentJson: string | null } | undefined
  if (!row) return null
  const blocks = readOutlineBlocks(row.contentJson)
  for (let paragraphIdx = 0; paragraphIdx < blocks.length; paragraphIdx += 1) {
    const quote = blockText(blocks[paragraphIdx])
    const range = sliceNeedle(quote, spec.needle)
    if (!range) continue
    return {
      kind: 'outline',
      outlineItemId: row.outlineItemId,
      paragraphIdx,
      quote,
      ...range
    }
  }
  return null
}

/** 逐条建伏笔：埋点 → 回收点（create 不收回收点，须再 update）→ 废弃标记。 */
function seedForeshadows(bookId: string): void {
  for (const seed of GUIDE_FORESHADOWS) {
    const body = seed.body ? resolveChapterAnchor(bookId, seed.body) : null
    if (seed.body && !body) {
      log.warn('伏笔正文锚点未解析，槽位留空', { bookId, title: seed.title, ...seed.body })
    }
    const outline = seed.outline ? resolveOutlineAnchor(bookId, seed.outline) : null
    if (seed.outline && !outline) {
      log.warn('伏笔大纲锚点未解析，槽位留空', { bookId, title: seed.title, ...seed.outline })
    }
    const created = createForeshadow(bookId, {
      title: seed.title,
      descriptionJson: seed.descriptionJson,
      ...(body ? { anchor: body } : {}),
      ...(outline ? { anchor2: outline } : {})
    })
    if (seed.recover) {
      const recoverAnchor = resolveChapterAnchor(bookId, seed.recover)
      if (!recoverAnchor) {
        log.warn('伏笔回收锚点未解析，未写入回收位置', {
          bookId,
          title: seed.title,
          ...seed.recover
        })
      } else {
        updateForeshadow(created.id, {
          recoverAnchor,
          recoveryNote: seed.recoveryNote ?? ''
        })
      }
    }
    if (seed.abandoned === true) {
      const result = setForeshadowAbandoned(created.id, true)
      if (!result.ok) {
        log.warn('伏笔废弃标记未写入', { bookId, title: seed.title, reason: result.reason })
      }
    }
  }
}

/** 逐条建灵感（标签在写入侧统一归一化）。 */
function seedInspirations(bookId: string): void {
  for (const seed of GUIDE_INSPIRATIONS) {
    createInspiration(bookId, {
      title: seed.title,
      content: seed.content,
      tags: [...seed.tags]
    })
  }
}

/**
 * 为指定书籍播种伏笔与灵感示范数据（幂等、按书隔离）。
 *
 * 守卫（任一命中即返回且**不置标记**，下次启动重试）：
 * - 书行不存在（用户删掉教学书）；
 * - 该书没有任何未删除章（用户把教学书删空）——避免示范数据「删了又回来」。
 */
export function seedGuideThreads(bookId: string): void {
  const db = getDb()
  const book = db.prepare('SELECT id FROM books WHERE id = ?').get(bookId)
  if (!book) return
  if (getSetting(seedMarkerKey(bookId)) === '1') return
  const live = db
    .prepare('SELECT COUNT(*) AS total FROM chapters WHERE book_id = ? AND deleted_at IS NULL')
    .get(bookId) as { total: number }
  if (live.total === 0) return

  db.transaction(() => {
    // 标记缺失但已有行（老库补种 / 标记被清）：先物理清空该书，再按新文案重播。
    db.prepare('DELETE FROM foreshadows WHERE book_id = ?').run(bookId)
    db.prepare('DELETE FROM inspirations WHERE book_id = ?').run(bookId)
    seedForeshadows(bookId)
    seedInspirations(bookId)
    setSetting(seedMarkerKey(bookId), '1')
  })()
}
