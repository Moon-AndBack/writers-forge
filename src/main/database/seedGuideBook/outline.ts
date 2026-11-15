import { seedBulletList, seedHeading, seedOutlineDoc, seedParagraph } from '../seedBlocks'
import type { SeedOutlineDoc } from '../seedBlocks'
import { OUTLINE_DOSSIER_GROUPS } from './outlineDossier'
import { OUTLINE_QUICK_GROUPS } from './outlineQuick'
import { OUTLINE_TOOLS_GROUPS } from './outlineTools'

/**
 * 教学书**大纲域**种子数据（聚合入口）。
 *
 * 按功能模块拆到三个子文件（保持单文件 ≤500 行，§3）：
 * - `outlineQuick.ts`：快速上手 + 章节与大纲（9 条）；
 * - `outlineDossier.ts`：剧情与时间线 + 设定档案（11 条）；
 * - `outlineTools.ts`：伏笔与灵感 + AI 助手 + 界面与设置（16 条）。
 *
 * 结构（对齐 `schema/outlineItems.ts`）：
 * - **分组 = `volumes.kind='group'` 的一行**：经 `createOutlineGroup` 建立，
 *   仅大纲页可见、其下不能挂章节；
 * - **条目挂分组**：经 `createOutlineItem(bookId, 分组 id, title)` 建立，
 *   正文**整条内联**在 `outline_items.content_json`（经 `saveOutlineContent` 落库）；
 * - 另有一条**独立条目**（`volumeId = null`，列表置顶）。
 *
 * 大纲条目是功能速查：只讲规则与边界，与章节正文的流程讲解互补。
 * ⚠️ 维护约定（AGENTS §7.5）：与 `./volumes*.ts` 同批维护。
 */

/** 大纲教学条目：标题 + 整条正文（块级 JSON 串 + 纯文本摘要）。 */
export interface SeedOutlineEntry {
  title: string
  doc: SeedOutlineDoc
}

/** 大纲教学分组：分组名 + 其下条目（顺序即展示序）。 */
export interface SeedOutlineGroup {
  /** 分组名（= 功能分区）。 */
  group: string
  entries: readonly SeedOutlineEntry[]
}

/**
 * 大纲教学数据：分组 = 功能分区，条目 = 功能要点（每条目一篇富文本速查）。
 * 建数据走 `createOutlineGroup` / `createOutlineItem` + `saveOutlineContent` 正式链路。
 */
export const GUIDE_OUTLINE: readonly SeedOutlineGroup[] = [
  ...OUTLINE_QUICK_GROUPS,
  ...OUTLINE_DOSSIER_GROUPS,
  ...OUTLINE_TOOLS_GROUPS
]

/**
 * 置顶独立条目（`volumeId = null`，不挂任何卷）：示范「单项条目」形态。
 * 建数据经 `createOutlineItem(bookId, null, title)` + `saveOutlineContent`。
 */
export const GUIDE_OUTLINE_STANDALONE: SeedOutlineEntry = {
  title: '写作前的准备清单',
  doc: seedOutlineDoc([
    seedHeading('要点'),
    seedParagraph('开写前先把这几件事定下来，后面少返工。'),
    seedBulletList([
      '想清楚这本书的频道与分类——它们会影响 AI 内置提示词的风格约束。',
      '建好卷章骨架再写正文；正文是纯段落，结构靠卷章与大纲承载。',
      '先在设定档案里建主要角色与世界观，正文里的名字会自动高亮。',
      '需要 AI 辅助就先去设置里填密钥、选模型；决定好要不要开自动保存与稿纸横线。'
    ])
  ])
}
