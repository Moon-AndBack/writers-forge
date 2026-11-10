/**
 * 写作页大纲树：展示口径纯函数（v3）。
 *
 * 数据真源为主进程 `outline` 域（`OutlineItemRow`）。**类型不再本地镜像**：直接
 * `import type` 复用主进程 `database/outline` 与 `database/chapters` 的导出（`import type`
 * 编译期擦除，不污染 renderer bundle；§9 单一真源）。卷类型复用章节域 `VolumeRow`
 * ——章节域与大纲域共用同一卷池（主进程 `volumes` 表）。
 *
 * 数据模型（新）：**分组 = `volumes.kind='group'` 的一行**（不是 `outline_items` 的行），
 * 其下条目 = `outline_items` 中 `volume_id = 分组 id AND kind='entry'`；**无 `parentId` /
 * `isGroup`**，层级仅两层。故本模块只做：
 * - **分层**：置顶区（独立条目 `volumeId === null` + 分组容器）与卷区（正文卷 `kind='normal'`）
 *   两部分，各自组内按 `sortOrder, id`；
 * - **条目展示名**：纯自定义名——无「第X章」编号，无 pin / 状态等章节域专属概念；
 *   空串名回退占位（仅展示层，不改数据）。
 */

import type { DeletedOutlineItemRow, OutlineItemRow } from '../../../../../main/database/outline'
import type { VolumeRow } from '../chapters/chapterTree'

export type { OutlineItemRow }

/** 大纲侧卷行 = 章节域 `VolumeRow`（统一卷池的同一真源，不另立平行结构，§9）。 */
export type OutlineVolumeRow = VolumeRow

/** 大纲编辑目标种类：条目（章）/ 分组容器 / 正文卷。 */
export type OutlineTargetKind = 'entry' | 'group' | 'volume'

/** 大纲编辑选中态（页面层持有，左栏树与中栏编辑器共享）。 */
export interface OutlineSelection {
  kind: OutlineTargetKind
  /** 目标行 id（entry = 条目行 id；group / volume = 卷行 id）。 */
  id: number
}

/**
 * 大纲编辑器编辑目标：由 `OutlineSelection` 解析派生（页面层负责查行与口径拼装；
 * 目标行已删除 / 卷缺失 → 解析为 null）。
 */
export interface OutlineEditorTarget {
  kind: OutlineTargetKind
  /** 目标行 id（条目行 id / 卷行 id）。 */
  id: number
  /**
   * 正文载体行 id（`outline_items.id`）：
   * - 条目（`scope='entry'`）= 条目自身行 id；
   * - 正文卷 / 分组容器 = 各自卷级大纲行（`scope='volume'`）id（经 `outline:getVolumeOutline` 解析）；
   * - 载体缺失（如卷纲行缺失）→ `null`（正文区渲染不可编辑占位）。
   */
  contentId: number | null
  /** 题名（编辑头名段初值）：条目 / 分组 = `title`；卷 = 名段（`title`）。 */
  title: string
  /** 编辑头前缀：卷 = 「卷X」（`kind='normal'` 且 `numberIndex>0`）；条目 / 分组 = 空串。 */
  prefix: string
  /**
   * 目标正文载体的最近更新时间（SQLite UTC 文本），供编辑头「最后编辑」相对时间展示：
   * - 条目 = 条目行 `updated_at`；
   * - 正文卷 / 分组 = 其卷纲行（`scope='volume'`）`updated_at`（正文保存随之刷新）。
   * 载体缺失 / 未解析到行 → null（回退不展示）。
   */
  updatedAt: string | null
}

/** 大纲树卷分组：正文卷 + 其下条目（组内按 `sortOrder, id`）。 */
export interface OutlineVolumeGroup {
  /** 分组唯一 key（`v{id}`）。 */
  key: string
  /** 所属卷（共享卷池行，`kind='normal'`）。 */
  volume: VolumeRow
  /** 该卷下条目（按 `sortOrder, id` 升序）。 */
  chapters: OutlineItemRow[]
}

/** 置顶区**分组容器**：`volumes.kind='group'` 的一行 + 其下条目（不可嵌套）。 */
export interface OutlineNonVolumeGroup {
  type: 'group'
  /** 条目唯一 key（`g{id}`，与卷区 `v{id}` / 单条目 `c{id}` 区分）。 */
  key: string
  /** 分组容器卷行（`kind='group'`）。 */
  volume: VolumeRow
  /** 分组下条目（`volumeId === 分组.id`，按后端给定顺序）。 */
  items: OutlineItemRow[]
}

/** 置顶区**单条目**：独立条目（`volumeId === null`），点开直接进入中栏编辑。 */
export interface OutlineNonVolumeItem {
  type: 'item'
  /** 条目唯一 key（`c{id}`）。 */
  key: string
  item: OutlineItemRow
}

/** 置顶区顶层条目（独立条目 / 分组容器；独立条目在前，分组容器在后）。 */
export type OutlineNonVolumeEntry = OutlineNonVolumeGroup | OutlineNonVolumeItem

/** 大纲树结构：置顶区（独立条目 + 分组容器）与卷区（正文卷）两部分。 */
export interface OutlineTreeStructure {
  /** 置顶区顶层条目：独立条目（`volumeId === null`）在前，分组容器（`kind='group'`）在后。 */
  nonVolume: OutlineNonVolumeEntry[]
  /** 卷区分组（正文卷 `kind='normal'`，按传入卷序）。 */
  volumes: OutlineVolumeGroup[]
}

/**
 * 条目显示名：`title` 非空取原文，否则回退占位 `emptyLabel`（条目名允许空串；
 * 调用方经 `t('unnamedChapter')` / `t('unnamedGroup')` 提供）。
 */
export function outlineItemLabel(item: Pick<OutlineItemRow, 'title'>, emptyLabel: string): string {
  return item.title.trim() !== '' ? item.title : emptyLabel
}

/**
 * 回收站条目是否禁止单独还原：父卷已删 / 缺失 / 非大纲可见 kind（`normal` / `group`）
 * 时禁止；独立条目（`volumeId === null`）无父卷，允许还原。与主进程
 * `restoreOutlineItem` 的父卷守卫同口径。
 */
export function isOutlineItemRestoreBlocked(
  item: Pick<DeletedOutlineItemRow, 'volumeId' | 'volumeKind' | 'volumeInTrash'>
): boolean {
  if (item.volumeId === null) return false
  if (item.volumeInTrash) return true
  return item.volumeKind !== 'normal' && item.volumeKind !== 'group'
}

/**
 * 大纲树分层：同时输出**置顶区**（独立条目 + 分组容器）与**卷区**（正文卷）两部分。
 *
 * - `volumes`：调用方已过滤为大纲页可见卷（`kind IN ('normal','group')`，见
 *   `OUTLINE_VISIBLE_VOLUME_KINDS`）；本函数按 `kind` 分流——`group` → 置顶区容器、
 *   `normal` → 卷区分组；
 * - `items`：`scope='entry'` 条目；`volumeId === null` → 置顶区独立条目，非空 → 挂到
 *   对应卷 / 分组（**归拢键天然是 `volumeId`**，分组即卷，无 `parentId` 子查询）；
 * - 组内一律按 `sortOrder, id` 升序；置顶区顺序为「独立条目 → 分组容器」。
 */
export function buildOutlineTree(
  volumes: VolumeRow[],
  items: OutlineItemRow[]
): OutlineTreeStructure {
  const nonVolume: OutlineNonVolumeEntry[] = []
  const byVolume = new Map<number, OutlineItemRow[]>()

  for (const item of items) {
    if (item.volumeId === null) {
      nonVolume.push({ type: 'item', key: `c${item.id}`, item })
      continue
    }
    const list = byVolume.get(item.volumeId)
    if (list) list.push(item)
    else byVolume.set(item.volumeId, [item])
  }

  const volumes_: OutlineVolumeGroup[] = []
  for (const volume of volumes) {
    const grouped = (byVolume.get(volume.id) ?? []).slice()
    grouped.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
    if (volume.kind === 'group') {
      nonVolume.push({ type: 'group', key: `g${volume.id}`, volume, items: grouped })
    } else {
      volumes_.push({ key: `v${volume.id}`, volume, chapters: grouped })
    }
  }

  return { nonVolume, volumes: volumes_ }
}
