/**
 * 大纲域类型与列常量（供 `outline/` 各子模块共享）。
 *
 * 数据模型（对齐 `schema/outlineItems.ts`，取代旧 `outline_chapters`）：
 * - **复用章节域 `volumes` 卷池**：大纲页可见卷 = `kind IN ('normal','group')`
 *   （`normal` 正文卷 + `group` 分组容器；`custom` 自定义卷仅章节页可见）；
 * - **分组不是条目的 kind**：分组 = `volumes.kind='group'` 的一行，其下条目 =
 *   本域 `outline_items` 中 `volume_id = 分组 id AND kind='entry' AND scope='entry'`；
 *   `outline_items` 无 `kind='group'`、无 `parent_id`，层级仅两层；
 * - **条目判别 `kind`**：`standalone`（不挂卷，列表置顶，`volume_id IS NULL`）/
 *   `entry`（卷下条目，`volume_id` 非空）；表级 CHECK 强制二者与 `volume_id` 一致；
 * - **行用途 `scope`**：`entry`（普通大纲条目，参与排序）/ `volume`（**卷级大纲正文行**，
 *   即某卷的卷纲，固定 `sort_order=0`、不参与条目排序）；每卷至多一条（部分唯一索引）；
 * - **正文内联**：`content_json`（整条正文块级 JSON，NULL = 空正文）+ `text`（纯文本摘要，
 *   字数统计与搜索真源）；旧「每行关联 documents」链路**已删除**。
 *
 * 软删除口径：删卷 / 删条目均**软删**（置 `deleted_at`），不物理删除；删卷级联软删其下
 * 全部大纲行（条目 + 卷纲）。回收站视图与还原 / 彻底删除见 `trash.ts`。
 */

import type { VolumeKind, VolumeRow } from '../chapterTypes'

/** 大纲页可见卷 kind（正文卷 + 分组容器；排除自定义卷）。单一真源在 `chapterTypes.ts`。 */
export { OUTLINE_VISIBLE_VOLUME_KINDS } from '../chapterTypes'

/**
 * 大纲侧卷行 = 章节域 `VolumeRow`（统一卷池的**同一真源**，不另立平行结构，§9）。
 * `sortOrder` 仅在 `(bookId, kind)` 内有意义；`numberIndex` 仅 `kind='normal'` 编号。
 */
export type OutlineVolumeRow = VolumeRow

/** 条目判别：`standalone` = 独立条目（置顶、不挂卷）；`entry` = 卷下条目。 */
export type OutlineKind = 'standalone' | 'entry'

/** 行用途：`entry` = 普通条目（参与排序）；`volume` = 卷级大纲正文行（卷纲，不参与排序）。 */
export type OutlineScope = 'entry' | 'volume'

/** 条目判别可选值（供 IPC / 映射防御）。 */
export const OUTLINE_KINDS: readonly OutlineKind[] = ['standalone', 'entry']

/** 行用途可选值（供 IPC / 映射防御）。 */
export const OUTLINE_SCOPES: readonly OutlineScope[] = ['entry', 'volume']

/**
 * 大纲条目行。
 * - `volumeId`：`null` = 独立条目（`kind='standalone'`）；数字 = 所属卷 / 分组（`kind='entry'`）；
 * - `scope`：`entry` 普通条目 / `volume` 卷级大纲正文行（卷纲）；
 * - `text`：完整纯文本摘要（**含标点**；标点仅在字数统计口径排除）；
 * - `contentJson`：整条正文块级 JSON（`null` = 空正文）。
 */
export interface OutlineItemRow {
  id: number
  bookId: string
  volumeId: number | null
  kind: OutlineKind
  scope: OutlineScope
  title: string
  sortOrder: number
  text: string
  contentJson: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** `outline_items` 原生 DB 行（snake_case；`kind` / `scope` 为原样字符串）。 */
export interface OutlineItemDbRow {
  id: number
  bookId: string
  volumeId: number | null
  kind: string
  scope: string
  title: string
  sortOrder: number
  text: string
  contentJson: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 条目列 SQL 片段（AS 别名对齐 `OutlineItemDbRow`）。 */
export const OUTLINE_ITEM_COLUMNS =
  'id, book_id AS bookId, volume_id AS volumeId, kind, scope, title, sort_order AS sortOrder, text, content_json AS contentJson, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'

/** 归一化条目判别（仅 `standalone` 合法，其余回退 `entry`）。 */
export function coerceOutlineKind(value: unknown): OutlineKind {
  return value === 'standalone' ? 'standalone' : 'entry'
}

/** 归一化行用途（仅 `volume` 合法，其余回退 `entry`）。 */
export function coerceOutlineScope(value: unknown): OutlineScope {
  return value === 'volume' ? 'volume' : 'entry'
}

/** DB 行 → 领域对象（`kind` / `scope` 经归一化，确保渲染层无需再判非法值）。 */
export function toOutlineItem(row: OutlineItemDbRow): OutlineItemRow {
  return {
    id: row.id,
    bookId: row.bookId,
    volumeId: row.volumeId,
    kind: coerceOutlineKind(row.kind),
    scope: coerceOutlineScope(row.scope),
    title: row.title,
    sortOrder: row.sortOrder,
    text: row.text,
    contentJson: row.contentJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt
  }
}

/** 大纲侧是否可见某卷 kind（`normal` + `group`）。 */
export function isOutlineVisibleVolumeKind(kind: VolumeKind): boolean {
  return kind === 'normal' || kind === 'group'
}

/* ---------- 回收站：类型 ---------- */

/**
 * 回收站中的条目行：`volumeTitle` 为其**原归属**卷名（供渲染「某某卷下的某某条目」）。
 * 父卷状态字段与章节域 `DeletedChapterRow` 对齐，供 UI 判定条目的归属是否可还原。
 */
export interface DeletedOutlineItemRow extends OutlineItemRow {
  volumeTitle: string | null
  /** 原归属卷 kind；独立条目为 `null`（父卷缺失的条目已由查询过滤）。 */
  volumeKind: VolumeKind | null
  /** 原归属卷是否在回收站（软删）；卷缺失时按 `false` 处理。 */
  volumeInTrash: boolean
}

/**
 * 回收站中的卷行：附带该卷卷纲行（`scope='volume'`）的正文 JSON。
 * 仅**已软删卷**有卷纲正文；未删收拢卷（其下有软删条目）的 `contentJson` 恒为 `null`。
 * 卷纲行缺失（旧数据 / 异常）或空正文时亦为 `null`。
 */
export interface DeletedOutlineVolumeRow extends VolumeRow {
  contentJson: string | null
}

/**
 * 大纲回收站内容：已软删的卷 + 下有软删条目的未删收拢卷，以及软删条目。
 * `volumes` 可能含未删除的收拢容器（其 `contentJson` 为 `null`，UI 不提供卷级操作）。
 */
export interface DeletedOutlineContent {
  volumes: DeletedOutlineVolumeRow[]
  items: DeletedOutlineItemRow[]
}

/** 清空大纲回收站的清除计数。 */
export interface OutlinePurgeCounts {
  volumes: number
  items: number
}
