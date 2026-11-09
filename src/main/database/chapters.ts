import Database from 'better-sqlite3'
import { getDb } from './index'
import { countEffectiveChars } from './wordCount'
import { NOW, PIN_RANK_SQL, nextChapterSortOrder, renumberChaptersInGroup } from './chapterGroups'
import { assignChapterNumberIndex, resolveChapterNumberIndex } from './chapterOrdering'
import { coerceChapterKind, coerceVolumeKind, toChapter } from './chapterMappers'
import { CHAPTER_COLUMNS } from './chapterTypes'
import type {
  ChapterDbRow,
  ChapterKind,
  ChapterPin,
  ChapterRow,
  ChapterStats,
  CreateChapterInput,
  RenameChapterPatch
} from './chapterTypes'
import type { ChapterStatus } from './chapterStatus'
import { MAX_CHAPTERS_PER_VOLUME, coerceStatus } from './chapterStatus'

/**
 * 章域（卷域在 `volumes.ts`，共享类型在 `chapterTypes.ts`；本文件保持 ≤500 行，§3）。
 *
 * 对外导出（含 re-export）保持既有导入路径稳定：`ipc` / `chapterTrash` / `chapterSeed`
 * 继续 `from './database/chapters'` 导入。
 *
 * **正文链路已随 `documents` 表删除而消失**：章不再关联 `documents` 行，正文的唯一归属是
 * `paragraphs.chapter_id`（外键 CASCADE），故创建 / 改名章**不再有任何建档动作**。
 */

/** 卷域 re-export（`ipc/chapters.ts` / 渲染层 preload 类型继续从此导入）。 */
export {
  createVolume,
  deleteVolume,
  getVolumeDeleteImpact,
  listVolumes,
  renameVolume
} from './volumes'
export type { VolumeDeleteImpact } from './volumes'
export type {
  ChapterKind,
  ChapterPin,
  ChapterRow,
  ChapterStats,
  CreateChapterInput,
  CreateVolumeInput,
  RenameChapterPatch,
  VolumeKind,
  VolumeRow
} from './chapterTypes'
export { CHAPTER_VISIBLE_VOLUME_KINDS, OUTLINE_VISIBLE_VOLUME_KINDS } from './chapterTypes'
export type { ChapterStatus } from './chapterStatus'
export { MAX_CHAPTERS_PER_VOLUME, CHAPTER_STATUSES } from './chapterStatus'
export {
  CHAPTER_SELECT,
  VOLUME_SELECT,
  coerceChapterKind,
  coerceVolumeKind,
  toChapter,
  toVolume
} from './chapterMappers'
export { moveChapter, reorderChapter, reorderVolume } from './chapterReorder'

/* ---------- 查询 ---------- */

/**
 * 列出某书全部**未删除**章。排序：按所属卷，组内按 pin 段（top → 普通 → 无 pin →
 * bottom）、`sortOrder`、id；返回时附组内动态 `numberIndex`（特殊章不占号）。
 */
export function listChapters(bookId: string): ChapterRow[] {
  const statement: Database.Statement<[string], ChapterDbRow> = getDb().prepare(
    `SELECT ${CHAPTER_COLUMNS} FROM chapters WHERE book_id = ? AND deleted_at IS NULL
     ORDER BY volume_id, ${PIN_RANK_SQL}, sort_order, id`
  )
  return assignChapterNumberIndex(statement.all(bookId).map(toChapter))
}

/** 单章查询（含回收站中的章），不存在返回 null；附同口径动态 `numberIndex`（回收站章节为 0）。 */
export function getChapter(id: number): ChapterRow | null {
  const row = getDb().prepare(`SELECT ${CHAPTER_COLUMNS} FROM chapters WHERE id = ?`).get(id) as
    ChapterDbRow | undefined
  if (!row) return null
  const chapter = toChapter(row)
  if (chapter.deletedAt !== null) return chapter
  return { ...chapter, numberIndex: resolveChapterNumberIndex(chapter.bookId, id) }
}

/* ---------- 写入 ---------- */

/**
 * 卷内普通章容量检查：卷内未删除**普通章**（`kind='normal'`）数达上限即拒绝新建普通章
 * （特殊章不占编号、不占容量）。守卫 4 见 `schema/chapters.ts` 头注释。
 */
function assertChapterCapacity(bookId: string, volumeId: number): void {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count FROM chapters
       WHERE book_id = ? AND volume_id = ? AND deleted_at IS NULL AND kind = 'normal'`
    )
    .get(bookId, volumeId) as { count: number }
  if (row.count >= MAX_CHAPTERS_PER_VOLUME) {
    throw new Error(`卷内普通章已达上限 ${MAX_CHAPTERS_PER_VOLUME}`)
  }
}

/**
 * 计算创建章时的最终落库值：`title` 存名段（普通章可空串 = 无自定义名）；
 * 特殊章须 `specialPrefix` 非空且名段非空（守卫 3，两段齐全），普通章 `special_prefix` 恒 NULL。
 */
function resolveChapterFields(
  input: CreateChapterInput,
  kind: ChapterKind
): {
  title: string
  specialPrefix: string | null
} {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (kind === 'special') {
    const prefix = typeof input.specialPrefix === 'string' ? input.specialPrefix.trim() : ''
    return { title, specialPrefix: prefix !== '' ? prefix : null }
  }
  return { title, specialPrefix: null }
}

/**
 * 创建章（**再建档链路已删除**：`documents` 表不存在，正文直接挂 `paragraphs.chapter_id`，
 * 空正文即 0 段，编辑器按「无段落 = 空文档」处理）。
 *
 * `pin`（特殊章置顶 / 置底）：特殊章缺省 `'top'`（应用层默认），普通章恒 `null`。
 *
 * 校验（非法一律抛错，事务回滚）：
 * - `volumeId` 必填（用户可选的「未分卷」已移除）；
 * - **系统「未分卷」卷（`is_unfiled=1`）下不可直接建章**（只承接回收站还原与拖拽移入）；
 * - **分组容器卷（`kind='group'`）下不可挂章**（守卫 1：复合外键只保证同书、不校验卷 kind）；
 * - 特殊章（`kind='special'`）须有前段 + 名段两段（守卫 3）；**自定义卷（`kind='custom'`）
 *   内禁止特殊章**（守卫 2）；
 * - 普通章容量上限 `MAX_CHAPTERS_PER_VOLUME`（守卫 4，只数普通章）。
 */
export function createChapter(bookId: string, input: CreateChapterInput): ChapterRow {
  const db = getDb()
  const volumeId = input.volumeId
  if (typeof volumeId !== 'number' || !Number.isInteger(volumeId) || volumeId <= 0) {
    throw new Error('createChapter: volumeId 必填（用户可选未分卷已移除）')
  }
  const volume = db
    .prepare(
      'SELECT kind, is_unfiled AS isUnfiled FROM volumes WHERE id = ? AND book_id = ? AND deleted_at IS NULL'
    )
    .get(volumeId, bookId) as { kind: string; isUnfiled: number } | undefined
  if (!volume) throw new Error(`createChapter: 卷不存在（volumeId=${volumeId}）`)
  const volumeKind = coerceVolumeKind(volume.kind)
  // 守卫 0：系统「未分卷」卷是还原 / 移入的兜底容器，不允许直接建章。
  if (volume.isUnfiled === 1) {
    throw new Error('createChapter: 未分卷卷仅承接还原与移入章节，不允许直接新建')
  }
  // 守卫 1：分组容器卷仅大纲页可见，其下不能挂章。
  if (volumeKind === 'group') throw new Error('createChapter: 分组容器卷下不允许挂章节')

  const kind: ChapterKind = coerceChapterKind(input.kind)
  // 守卫 2：特殊章不得置于自定义卷内。
  if (kind === 'special' && volumeKind === 'custom') {
    throw new Error('createChapter: 自定义卷内不允许特殊章')
  }

  const { title, specialPrefix } = resolveChapterFields(input, kind)
  // 守卫 3：特殊章须有前段与名段两段。
  if (kind === 'special' && (specialPrefix === null || title === '')) {
    throw new Error('createChapter: 特殊章须有前段与名段')
  }
  // 守卫 4：卷内普通章容量上限。
  if (kind === 'normal') assertChapterCapacity(bookId, volumeId)

  const createdId = db.transaction((): number => {
    const result = db
      .prepare(
        `INSERT INTO chapters (book_id, volume_id, kind, title, special_prefix, sort_order, status, pin)
         VALUES (@bookId, @volumeId, @kind, @title, @specialPrefix, @sortOrder, @status, @pin)`
      )
      .run({
        bookId,
        volumeId,
        kind,
        title,
        specialPrefix,
        sortOrder: nextChapterSortOrder(bookId, volumeId),
        status: coerceStatus(input.status),
        // CHECK (kind = 'special' OR pin IS NULL)：普通章恒不带 pin；特殊章缺省置顶（应用层默认，
        // 不动 DDL 列级 DEFAULT，保留表级 CHECK）。
        pin: kind === 'special' ? (input.pin ?? 'top') : null
      })
    return Number(result.lastInsertRowid)
  })()

  const created = getChapter(createdId)
  if (!created) throw new Error('Failed to read back created chapter')
  return created
}

/**
 * 重命名 / 改属性章：**不再同步任何 document 标题**（`documents` 表已删除）；
 * 正文真源是 `paragraphs`，与章名无关。
 * - `specialPrefix`：仅特殊章生效（普通章保持 NULL，传入忽略）；省略时后端读库保持原值；
 * - `kind: 'normal'`（特殊章转普通章）**运行时拒绝**：会牵动编号与 pin 语义，超出本补丁范围。
 */
export function renameChapter(id: number, patch: RenameChapterPatch): ChapterRow | null {
  const db = getDb()
  return db.transaction(() => {
    const existing = db.prepare('SELECT kind FROM chapters WHERE id = ?').get(id) as
      { kind: string } | undefined
    if (!existing) return null
    if (patch.kind === 'normal') {
      throw new Error('renameChapter: 不支持特殊章转普通章（kind:normal 已移除）')
    }
    const kind = coerceChapterKind(existing.kind)
    const title = typeof patch.title === 'string' ? patch.title.trim() : ''
    let specialPrefix: string | null = null
    if (kind === 'special') {
      if (patch.specialPrefix !== undefined) {
        specialPrefix =
          typeof patch.specialPrefix === 'string' && patch.specialPrefix.trim() !== ''
            ? patch.specialPrefix.trim()
            : null
      } else {
        const row = db
          .prepare('SELECT special_prefix AS specialPrefix FROM chapters WHERE id = ?')
          .get(id) as { specialPrefix: string | null } | undefined
        specialPrefix = row?.specialPrefix ?? null
      }
      // 守卫 3 在改名路径同样成立：特殊章必须保持两段齐全。
      if (title === '' || specialPrefix === null) {
        throw new Error('renameChapter: 特殊章须保留前段与名段')
      }
    }
    db.prepare(
      `UPDATE chapters SET title = @title, special_prefix = @specialPrefix, updated_at = ${NOW}
       WHERE id = @id`
    ).run({ id, title, specialPrefix })
    return getChapter(id)
  })()
}

/**
 * 设置特殊章置顶 / 置底：仅**未删除特殊章**可设；写入 `pin` 后重排组内 sortOrder，
 * 使 pin 段与 `sort_order` 自洽（段内保持相对次序，pin 间互排可继续拖拽）。
 * 不存在 / 回收站章 / 普通章返回 null。
 */
export function setChapterPin(id: number, pin: ChapterPin): ChapterRow | null {
  const db = getDb()
  return db.transaction(() => {
    const row = db
      .prepare(
        'SELECT book_id AS bookId, volume_id AS volumeId, kind, deleted_at AS deletedAt FROM chapters WHERE id = ?'
      )
      .get(id) as
      { bookId: string; volumeId: number; kind: string; deletedAt: string | null } | undefined
    if (!row || row.deletedAt !== null || coerceChapterKind(row.kind) !== 'special') return null
    db.prepare(`UPDATE chapters SET pin = ?, updated_at = ${NOW} WHERE id = ?`).run(pin, id)
    renumberChaptersInGroup(row.bookId, row.volumeId)
    return getChapter(id)
  })()
}

/**
 * 改章节状态（两态：草稿 / 定稿），不存在返回 null。
 * 仅更新 `status`，**不**刷新 `updated_at`——「最后编辑」口径为正文 / 元信息修订时间，
 * 状态切换是展示态切换，不视为一次编辑。
 */
export function setChapterStatus(id: number, status: ChapterStatus): ChapterRow | null {
  const db = getDb()
  const result = db
    .prepare('UPDATE chapters SET status = ? WHERE id = ?')
    .run(coerceStatus(status), id)
  if (Number(result.changes) === 0) return null
  return getChapter(id)
}

/**
 * 软删除章：置 `deleted_at`，**不物理删除**（段落随外键在物理删章时级联清理），
 * 便于回收站还原；随后对同组剩余**未删除**章重排 sortOrder（编号在卷内保持连续）。
 */
export function deleteChapter(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare(
        'SELECT book_id AS bookId, volume_id AS volumeId, deleted_at AS deletedAt FROM chapters WHERE id = ?'
      )
      .get(id) as { bookId: string; volumeId: number; deletedAt: string | null } | undefined
    if (!row || row.deletedAt !== null) return false

    db.prepare(`UPDATE chapters SET deleted_at = ${NOW} WHERE id = ?`).run(id)
    renumberChaptersInGroup(row.bookId, row.volumeId)
    return true
  })()
}

/**
 * 书籍章节统计：`chapters` 为章数，`words` 为该书全部**未删除**章正文的有效字数之和
 * （口径见 `wordCount.ts`，与编辑器脚注一致，排除标点 / 符号 / 空白）。
 * 正文 join 走 `paragraphs.chapter_id = chapters.id`（`documents` 表已删除）。
 */
export function bookChapterStats(bookId: string): ChapterStats {
  const countRow = getDb()
    .prepare('SELECT COUNT(*) AS count FROM chapters WHERE book_id = ? AND deleted_at IS NULL')
    .get(bookId) as { count: number }

  const textRows = getDb()
    .prepare(
      `SELECT p.text AS text FROM paragraphs p
       JOIN chapters c ON c.id = p.chapter_id
       WHERE c.book_id = ? AND c.deleted_at IS NULL`
    )
    .all(bookId) as Array<{ text: string }>

  return {
    chapters: countRow.count,
    words: countEffectiveChars(textRows.map((row) => row.text))
  }
}
