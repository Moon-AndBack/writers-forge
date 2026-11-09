/**
 * preload 类型域 · **大纲**（主进程 `database/outline`）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从 `database/outline` 取用，不逐字镜像（`import type`
 * 编译期擦除，不污染 renderer bundle，理由见 `database.d.ts` 文件头）。
 */

import type {
  DeletedOutlineContent,
  DeletedOutlineItemRow,
  DeletedOutlineVolumeRow,
  OutlineItemRow,
  OutlineKind,
  OutlinePurgeCounts,
  OutlineScope,
  OutlineVolumeRow
} from '../../main/database/outline'

export type {
  DeletedOutlineContent,
  DeletedOutlineItemRow,
  DeletedOutlineVolumeRow,
  OutlineItemRow,
  OutlineKind,
  OutlinePurgeCounts,
  OutlineScope,
  OutlineVolumeRow
}

/**
 * 大纲正文读取结果（`outline:getContent` / `outline:getVolumeOutline` 出参形状）：
 * `contentJson` = 整条大纲正文的块级 JSON（`null` = 空正文），`text` = 库内派生的纯文本摘要
 * （字数统计与搜索真源）。
 */
export interface OutlineContentPayload {
  /** 正文载体行 id：条目 id（`scope='entry'`）或卷级大纲行 id（`scope='volume'`）。 */
  id: number
  /** 块级 Tiptap JSON 串；`null` = 空正文。 */
  contentJson: string | null
  /** 由 `contentJson` 派生的纯文本摘要。 */
  text: string
  /** 载体行 `updated_at`（SQLite UTC 文本），供编辑头「最后编辑」相对时间展示。 */
  updatedAt: string
}
