import type { SeedVolume } from '../seedBlocks'

/**
 * 教学书**章节域**种子数据（首启唯一书籍「Writer's Forge · 使用指南」的卷 / 章）。
 *
 * 组织结构：**卷 = 功能分区**（正文卷，自动「卷X」编号），**章 = 具体功能**；
 * 每章正文以块级 JSON 表达（heading 步骤标题 + bulletList 步骤列表 + bold 关键词
 * ——本身就是格式能力的示范）。文案为中文硬编码（主进程种子属不译项，AGENTS §10）。
 *
 * 拆分说明（§3 单文件 ≤500 行）：本文件只承载**卷序**与**书籍元信息**；各卷正文按
 * 「卷 = 功能分区」分文件——卷一在 `./volumesStart.ts`、卷二在 `./volumesChapters.ts`、
 * 卷三「大纲」在 `./volumesOutline.ts`、卷四在 `./volumesEntities.ts`（其中子类章节在
 * `./volumesSubtypes.ts`）、卷五「界面与设置」在 `./volumesSettings.ts`；大纲教学数据在
 * `./outline.ts`，`seedGuideBook.ts` 仅做聚合与书籍元信息导出。
 *
 * ⚠️ 维护约定（AGENTS §7.5）：**新增功能与不兼容变更必须同步更新各卷文件**
 * （`./volumesStart.ts` / `./volumesChapters.ts` / `./volumesEntities.ts`，必要时连带
 * `./outline.ts` / `./volumesOutline.ts` / `./volumesSubtypes.ts` / `./volumesSettings.ts`），
 * 保证首次启动的教学书始终反映当前功能集。
 *
 * 文案与代码一致性：每条教学步骤以当前实现为准——快捷键取 Tiptap 扩展
 * 默认 keymap（章节编辑器：Ctrl+B / I / U、Ctrl+Shift+S、Ctrl+Z / Y / Shift+Z），
 * 按钮与流程取各组件 / 数据层实现（见各章注释中的代码依据）。
 * 表格块仅由大纲编辑器支持（插入面板「插入表格」），教学书正文不含表格块。
 */

/** 卷一「开始使用」（独立文件：§3 拆分，见该文件头注释）。 */
import { VOLUME_START } from './volumesStart'

/** 卷二「章节写作」（独立文件：§3 拆分，见该文件头注释）。 */
import { VOLUME_CHAPTERS } from './volumesChapters'

/** 卷三「大纲」（独立文件：§3 拆分，见该文件头注释）；re-export 保持聚合入口稳定。 */
import { VOLUME_OUTLINE } from './volumesOutline'
export { VOLUME_OUTLINE } from './volumesOutline'

/** 卷四「实体与面板」（独立文件：§3 拆分，见该文件头注释）。 */
import { VOLUME_ENTITIES } from './volumesEntities'

/** 卷五「界面与设置」（独立文件：§3 拆分，见该文件头注释）；re-export 保持聚合入口稳定。 */
import { VOLUME_SETTINGS } from './volumesSettings'
export { VOLUME_SETTINGS } from './volumesSettings'

/**
 * 教学书全部卷（分区）：顺序即章节树顺序。
 */
export const GUIDE_VOLUMES: readonly SeedVolume[] = [
  VOLUME_START,
  VOLUME_CHAPTERS,
  VOLUME_OUTLINE,
  VOLUME_ENTITIES,
  VOLUME_SETTINGS
]

/**
 * 教学书元信息（书名 / 作者 / 书籍简介 / 封面）。
 *
 * `categories` 为**分类 ID 列表**（`categories.id`）：官方 ID 由 `categories` 表自增决定
 * （灌入顺序相关），静态常量无法预知，故教学书留空 `[]`（分类树选法与自定义分类管理
 * 已在正文「书架」章与「界面与设置」卷讲解，本书自身不预选分类）。
 */
export const GUIDE_BOOK = {
  /** 固定 id，便于实体种子等模块显式引用。 */
  id: 'guide',
  title: "Writer's Forge · 使用指南",
  intro:
    "第一次使用「Writer's Forge」？这本指南会带你把书架、章节、大纲、剧情时间线、查找替换与各项设置都走一遍。读完即可删除本书。",
  categories: [] as number[],
  status: 'writing' as const,
  coverColor: 'teal'
}
