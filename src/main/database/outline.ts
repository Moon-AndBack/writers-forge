/**
 * 大纲域：聚合入口。
 *
 * 实现按职责拆分为 `outline/` 子模块（保持单文件 ≤500 行，§3）：
 * - `outline/types.ts`：类型与列常量；
 * - `outline/content.ts`：正文链路（`content_json` + `text`，条目 / 卷纲通用）；
 * - `outline/shared.ts`：条目排序辅助（下一序 / 组内重排）与卷序委托；
 * - `outline/volumes.ts`：卷 CRUD（委托章节域统一卷池）；
 * - `outline/chapters.ts`：条目 CRUD（含分组创建、跨组移动）；
 * - `outline/trash.ts`：回收站查询 / 还原 / 彻底删除。
 *
 * 本文件仅做 re-export，保持既有导入路径（`database/outline`）与导出面稳定。
 *
 * 数据模型（对齐 `schema/outlineItems.ts`）：
 * - **分组 = `volumes.kind='group'` 的一行**（不是条目行）；其下条目 = `outline_items` 中
 *   `volume_id = 分组 id AND kind='entry' AND scope='entry'`；无 `parent_id`、层级仅两层；
 * - **卷复用章节域卷池**（统一卷模型）：大纲页可见 `kind IN ('normal','group')`，
 *   章节页可见 `kind IN ('normal','custom')`；
 * - **正文内联**在 `outline_items.content_json`（取代旧 `documents` 链路）。
 */

export type {
  DeletedOutlineContent,
  DeletedOutlineItemRow,
  OutlineItemDbRow,
  OutlineItemRow,
  OutlineKind,
  OutlinePurgeCounts,
  OutlineScope,
  OutlineVolumeRow
} from './outline/types'
export {
  OUTLINE_ITEM_COLUMNS,
  OUTLINE_KINDS,
  OUTLINE_SCOPES,
  OUTLINE_VISIBLE_VOLUME_KINDS,
  coerceOutlineKind,
  coerceOutlineScope,
  toOutlineItem
} from './outline/types'

export type { OutlineContentPayloadRow } from './outline/content'
export {
  deriveOutlineText,
  getOutlineContent,
  getOutlineItem,
  getOutlineVolumeContent,
  saveOutlineContent
} from './outline/content'

export {
  listOutlineVolumes,
  createOutlineVolume,
  renameOutlineVolume,
  deleteOutlineVolume,
  reorderOutlineVolume
} from './outline/volumes'

export {
  listOutlineItems,
  createOutlineItem,
  createOutlineGroup,
  renameOutlineItem,
  deleteOutlineItem,
  reorderOutlineItem,
  moveOutlineItem
} from './outline/chapters'

export {
  listDeletedOutline,
  restoreOutlineVolume,
  restoreOutlineItem,
  purgeOutlineVolume,
  purgeOutlineItem,
  purgeAllDeletedOutline
} from './outline/trash'
