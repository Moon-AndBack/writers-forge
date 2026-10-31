import Database from 'better-sqlite3'
import { getDb } from './index'
import { NOW, nextVolumeSortOrder } from './chapterGroups'
import { nextVolumeDefaultTitle, normalizeVolumeTitle } from './chapterNaming'
import {
  VOLUME_DISPLAY_ORDER_SQL,
  assignVolumeNumberIndex,
  resolveVolumeNumberIndex
} from './chapterOrdering'
import { coerceVolumeKind, toVolume } from './chapterMappers'
import { CHAPTER_VISIBLE_VOLUME_KINDS, VOLUME_COLUMNS } from './chapterTypes'
import type { CreateVolumeInput, VolumeDbRow, VolumeRow } from './chapterTypes'

/**
 * 卷域（自 `chapters.ts` 拆出，保持单文件 ≤500 行，§3）。
 *
 * 卷数据模型（对齐 `schema/chapters.ts`）：
 * - **卷按 `kind` 三分**：`normal`（正文卷，参与「卷X」自动编号）、`custom`（自定义卷，整名不编号）、
 *   `group`（分组容器，**仅大纲页可见**，章节页不可见、其下不能挂章节）；
 * - `title`：库内只存用户可见名段（`custom` 时即完整整名），「卷X」编号**不落库**，
 *   由渲染层按 `kind='normal'` 的 `numberIndex` 动态拼出；
 * - `sort_order` **仅在 `(book_id, kind)` 内有意义**——三个 kind 各自分离的序号空间，
 *   故创建 / 重排 / 还原都必须带 kind 取序（见 `nextVolumeSortOrder`）；
 * - **每卷必有一条卷纲行**：建卷即在同一事务内插一条 `outline_items` 的 `scope='volume'`
 *   行（见 `insertVolumeOutlineRow`）；该事实以卷纲行是否存在为判据，不再由 `volumes`
 *   镜像列表达（旧 `has_outline` 列已删除）。
 *
 * 展示序（自定义卷置顶）由 `VOLUME_DISPLAY_ORDER_SQL` 独立表达，与落库序解耦：
 * 故 `listVolumes` 返回序 ≠ `sort_order` 序，编号（`numberIndex`）只按 `normal` 段递增。
 */

/** 卷行 → 领域对象（re-export 自 `chapterMappers`，保持 `chapters.ts` 单一来源）。 */
export { toVolume } from './chapterMappers'

/** 为单卷补齐动态 `numberIndex`（回收站卷或不存在 → 0）。 */
export function withVolumeNumberIndex(volume: VolumeRow): VolumeRow {
  if (volume.deletedAt !== null) return volume
  return { ...volume, numberIndex: resolveVolumeNumberIndex(volume.bookId, volume.id) }
}

/* ---------- 查询 ---------- */

/**
 * 列出某书全部**未删除**卷（章节页口径：排除仅大纲页可见的分组容器 `kind='group'`）。
 * 排序：自定义卷置顶在前，各段内按 `sortOrder`、id；返回时附动态 `numberIndex`
 * （仅 `normal` 卷编号 `1..n`，`custom` 恒 0）。大纲页另由 `outline/` 域按
 * `OUTLINE_VISIBLE_VOLUME_KINDS` 取（排除 `custom`、含 `group`）。
 */
export function listVolumes(bookId: string): VolumeRow[] {
  const kinds = CHAPTER_VISIBLE_VOLUME_KINDS.map((kind) => `'${kind}'`).join(', ')
  const statement: Database.Statement<[string], VolumeDbRow> = getDb().prepare(
    `SELECT ${VOLUME_COLUMNS} FROM volumes WHERE book_id = ? AND deleted_at IS NULL AND kind IN (${kinds})
     ORDER BY ${VOLUME_DISPLAY_ORDER_SQL}`
  )
  return assignVolumeNumberIndex(statement.all(bookId).map(toVolume))
}

/* ---------- 写入 ---------- */

/**
 * **建卷即建卷纲**（新模型下建卷的隐含契约）：为新卷插入一条 `outline_items` 的
 * `scope='volume'` 行（`kind='entry'`、`volume_id = 新卷 id`、`sort_order = 0`，
 * `title` / `text` 空、正文 `content_json` NULL）。
 *
 * 落在这里而非 `outline/` 域的原因：`createVolume` 必须与建卷原子同事务，而
 * `outline/` 目录属后续批次尚未重建；内联这一条 SQL 既避免跨域 import 造成的循环依赖，
 * 又保持「卷与其卷纲行同时存在」的不变式（与部分唯一索引互为约束）。
 * 大纲域重建时应迁回其侧，此处留单点 SQL 便于届时替换。
 */
function insertVolumeOutlineRow(volumeId: number, bookId: string): void {
  getDb()
    .prepare(
      `INSERT INTO outline_items (book_id, volume_id, kind, scope, title, sort_order, text)
       VALUES (@bookId, @volumeId, 'entry', 'volume', '', 0, '')`
    )
    .run({ bookId, volumeId })
}

/**
 * 创建卷（追加到**同 kind** 排序空间的末尾）。
 * - `kind='normal'`（缺省）：`title` 缺省时落自动编号名（`nextVolumeDefaultTitle`，只数 `normal` 卷），
 *   给了 `title` 则作为名段覆盖；
 * - `kind='custom'`：整名不编号，`title` 必填（缺名时数据层兜底回落「卷X」，IPC 层已拦截）；
 * - `kind='group'`：分组容器，仅大纲页可见，其下不可挂章；
 * - **建档链路已删除**（`documents` 表不存在）；改为**同事务建卷纲行**（`insertVolumeOutlineRow`）。
 */
export function createVolume(bookId: string, input: CreateVolumeInput = {}): VolumeRow {
  const kind = coerceVolumeKind(input.kind)
  const explicit = normalizeVolumeTitle(input.title)
  const finalTitle = explicit !== '' ? explicit : nextVolumeDefaultTitle(bookId)
  const db = getDb()
  const createdId = db.transaction((): number => {
    const result = db
      .prepare(
        'INSERT INTO volumes (book_id, kind, title, sort_order) VALUES (?, ?, ?, ?)'
      )
      .run(bookId, kind, finalTitle, nextVolumeSortOrder(bookId, kind))
    const id = Number(result.lastInsertRowid)
    // 建卷即建卷纲（同事务插 `scope='volume'` 行，与部分唯一索引互为约束）。
    insertVolumeOutlineRow(id, bookId)
    return id
  })()
  const created = db
    .prepare(`SELECT ${VOLUME_COLUMNS} FROM volumes WHERE id = ?`)
    .get(createdId) as VolumeDbRow
  return withVolumeNumberIndex(toVolume(created))
}

/**
 * 重命名卷：仅写 `title`（名段；`kind='normal'` 的「卷X」编号不落库，由渲染层动态拼），
 * 不存在返回 null。**不再同步任何 document 标题**（`documents` 表已删除），
 * 也**不改 kind**（卷判别变更需连带处理其下章 / 大纲条目，超出重命名范围）。
 */
export function renameVolume(id: number, title: string): VolumeRow | null {
  const db = getDb()
  return db.transaction((): VolumeRow | null => {
    const result = db
      .prepare(`UPDATE volumes SET title = ?, updated_at = ${NOW} WHERE id = ?`)
      .run(normalizeVolumeTitle(title), id)
    if (Number(result.changes) === 0) return null
    const row = db
      .prepare(`SELECT ${VOLUME_COLUMNS} FROM volumes WHERE id = ?`)
      .get(id) as VolumeDbRow
    return withVolumeNumberIndex(toVolume(row))
  })()
}

/**
 * 软删除卷：整卷进回收站（置 `deleted_at`），其下**未删除**章节一并软删除，
 * 保留卷-章归属以便还原。**不物理删除**，不解除 `volume_id`。
 *
 * `volumes` 为章节域与大纲域**共用卷池**，故同一事务内**同时级联软删大纲条目**
 * （`outline_items` 中挂本卷的未删行：`kind='entry'` 的卷下条目与 `scope='volume'` 的卷纲行），
 * 避免删卷后大纲条目悬空。
 */
export function deleteVolume(id: number): boolean {
  const db = getDb()
  return db.transaction((): boolean => {
    const row = db
      .prepare('SELECT book_id AS bookId, deleted_at AS deletedAt FROM volumes WHERE id = ?')
      .get(id) as { bookId: string; deletedAt: string | null } | undefined
    if (!row || row.deletedAt !== null) return false
    db.prepare(`UPDATE volumes SET deleted_at = ${NOW} WHERE id = ?`).run(id)
    db.prepare(
      `UPDATE chapters SET deleted_at = ${NOW} WHERE volume_id = ? AND deleted_at IS NULL`
    ).run(id)
    db.prepare(
      `UPDATE outline_items SET deleted_at = ${NOW} WHERE volume_id = ? AND deleted_at IS NULL`
    ).run(id)
    return true
  })()
}
