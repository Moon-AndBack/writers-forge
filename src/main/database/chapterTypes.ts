/**
 * 章节域共享类型与 SQL 列片段（供 `chapters.ts` / `volumes.ts` / `chapterTrash.ts` 复用，
 * 拆分原因：§3 单文件 ≤500 行——卷域拆出后类型需要中立载体）。
 *
 * 本文件是**新表结构契约**的类型镜像（表定义见 `schema/chapters.ts`）：
 * `volumes` = 卷池（判别列 `kind` 三态），`chapters` = 章（判别列 `kind` 两态 + `pin`）。
 * 旧列（`volumes.name` / `custom_name` / `is_special` / `document_id`、
 * `chapters.custom_name` / `is_special` / `document_id`）**已彻底删除**。
 */

/** 特殊章 pin 取值（'top' 置顶 / 'bottom' 置底；普通章恒 null）。 */
export type ChapterPin = 'top' | 'bottom'

/**
 * 卷判别：`normal` = 正文卷（参与「卷X」自动编号、章节页与大纲页均可见）、
 * `custom` = 自定义卷（整名不编号、章节页可见、大纲页**不可见**；
 * 系统「未分卷」卷也借用此 kind，由 `VolumeRow.isUnfiled` 区分）、
 * `group` = 分组容器（**仅大纲页可见**，章节页不可见，其下不能挂章节）。
 *
 * 可见性口径统一由 `CHAPTER_VISIBLE_VOLUME_KINDS` / `OUTLINE_VISIBLE_VOLUME_KINDS` 表达。
 */
export type VolumeKind = 'normal' | 'custom' | 'group'

/** 章判别：`normal` = 普通章（参与「第X章」编号、`pin` 恒 null）、`special` = 特殊章（不占号）。 */
export type ChapterKind = 'normal' | 'special'

/** 章节页可见的卷 kind（排除仅大纲页可见的分组容器）。 */
export const CHAPTER_VISIBLE_VOLUME_KINDS: readonly VolumeKind[] = ['normal', 'custom']

/** 大纲页可见的卷 kind（排除自定义卷；`group` 为分组容器）。 */
export const OUTLINE_VISIBLE_VOLUME_KINDS: readonly VolumeKind[] = ['normal', 'group']

/**
 * 卷行。`sortOrder` **仅在 `(bookId, kind)` 内有意义**（各 kind 分离的序号空间）；
 * `numberIndex` 为跨 kind 的展示序号：`kind='normal'` 按展示顺序 `1..n`，其余恒 0。
 */
export interface VolumeRow {
  id: number
  bookId: string
  /** 卷判别（见 `VolumeKind`）。 */
  kind: VolumeKind
  /**
   * 系统「未分卷」卷标记（每书至多一条，`kind` 借用 `'custom'`）。
   * `true` 时此卷为回收站还原 / 拖拽的兜底容器：不可改名 / 删除 / 重排 / 还原 / 彻底删除，
   * 也不允许直接在其下建章（只承接还原与移入的章）。
   */
  isUnfiled: boolean
  /**
   * 卷名段（库内只存用户可见名；「卷X」编号**不落库**，由渲染层按 `kind='normal'` 的
   * `numberIndex` 动态拼出；`kind='custom'` 时此处即完整整名）。
   */
  title: string
  sortOrder: number
  /**
   * 动态卷号：`kind='normal'` 按展示顺序 `1..n`；`custom` / `group` 恒 `0`（不参与编号）。
   * 由查询层按上下文计算（见 `chapterOrdering.ts`），渲染层直接使用。
   */
  numberIndex: number
  createdAt: string
  updatedAt: string
  /** 非 null 表示在回收站（回收站行 `numberIndex` 恒为 `0`，不参与编号）。 */
  deletedAt: string | null
}

/**
 * 章行（`volumeId` 数据层非空，`chapters.volume_id` 为 NOT NULL + 复合外键）。
 * - `kind`：普通章（参与「第X章」编号，`pin` 恒 null）/ 特殊章（不占号，`pin` 可置顶置底）；
 * - `title`：**名段**（不含「第X章」）；`specialPrefix`：特殊章前段（如「序章」），普通章恒 null；
 * - `numberIndex`：**卷内动态编号**，普通章 `1..n`、特殊章 `0`（见 `chapterOrdering.ts`）；
 * - `deletedAt` 非 null 表示在回收站（回收站章 `numberIndex` 恒为 `0`）。
 */
export interface ChapterRow {
  id: number
  bookId: string
  /** 所属卷 id（NOT NULL，每章必属一卷）。 */
  volumeId: number
  /** 章判别（见 `ChapterKind`）。 */
  kind: ChapterKind
  /** 名段（右框）：普通章 = 自定义名（可空串）；特殊章 = 名段。 */
  title: string
  /** 特殊章前段（左框，如「序章」）；普通章恒 null。 */
  specialPrefix: string | null
  sortOrder: number
  status: 'draft' | 'done'
  pin: ChapterPin | null
  /** 卷内动态编号（普通章 `1..n`，特殊章 / 回收站章 `0`）。 */
  numberIndex: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * 创建卷入参：`kind` 缺省 `normal`（自动「卷X」）。
 * - `normal`：自动编号 + 可空 `title`（名段）；
 * - `custom`：整名不编号，`title` 必填（IPC 校验）；
 * - `group`：分组容器，仅大纲页可见，其下不可挂章节。
 */
export interface CreateVolumeInput {
  kind?: VolumeKind
  /** `custom` 必填的完整卷名；`normal` 为可选名段；`group` 为分组名。 */
  title?: string
}

/**
 * 创建章入参（`volumeId` 必填，运行时校验正整数——用户可选的「未分卷」目标已移除；
 * 系统「未分卷」卷不接受直接建章，只承接还原与移入）。
 * `kind='special'` 时须同时给 `specialPrefix` + 非空 `title`（两段齐全）。
 */
export interface CreateChapterInput {
  /** 所属卷 id（必填；null / 非正整数非法）。 */
  volumeId?: number | null
  /** 名段（右框）；特殊章须非空。 */
  title?: string
  status?: 'draft' | 'done'
  /** 章判别：`special` = 特殊章（前段 + 名两段，不套「第X章」）。缺省 `normal`。 */
  kind?: ChapterKind
  /** 特殊章前段（左框，如「序章」）。特殊章必填。 */
  specialPrefix?: string | null
  /** 特殊章置顶 / 置底；特殊章缺省 `'top'`（应用层默认，见 `createChapter`）；普通章忽略（恒 null，CHECK 拒绝）。 */
  pin?: ChapterPin
}

/**
 * 重命名 / 改属性补丁：**不支持 kind 切换**（`kind: 'normal'` 运行时拒绝——
 * 特殊章转普通章会牵动编号与 pin 语义，超出本补丁范围）。
 * `specialPrefix` 仅特殊章生效；普通章忽略传入值。
 */
export interface RenameChapterPatch {
  title: string
  /** 仅允许缺省或 `'special'`；传 `'normal'` 运行时拒绝。 */
  kind?: ChapterKind
  specialPrefix?: string | null
}

/** 书籍章节统计：章数 + 有效字数（口径见 `wordCount.ts`）。 */
export interface ChapterStats {
  chapters: number
  words: number
}

/** 卷表数据库行（snake_case 直映，`kind` 为原样值）。 */
export interface VolumeDbRow {
  id: number
  bookId: string
  kind: string
  title: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  /** 系统「未分卷」卷标记（0 / 1）。 */
  is_unfiled: number
}

/** 章表数据库行（snake_case 直映）。 */
export interface ChapterDbRow {
  id: number
  bookId: string
  volumeId: number
  kind: string
  title: string
  specialPrefix: string | null
  sortOrder: number
  status: string
  pin: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 卷列 SQL 片段（AS 别名对齐 `VolumeDbRow`），供卷 / 回收站查询复用。 */
export const VOLUME_COLUMNS =
  'id, book_id AS bookId, kind, title, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt, is_unfiled'

/** 章列 SQL 片段（AS 别名对齐 `ChapterDbRow`），供章 / 回收站查询复用。 */
export const CHAPTER_COLUMNS =
  'id, book_id AS bookId, volume_id AS volumeId, kind, title, special_prefix AS specialPrefix, sort_order AS sortOrder, status, pin, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'
