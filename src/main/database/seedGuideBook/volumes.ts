import type { SeedVolume } from '../seedBlocks'

/**
 * 教学书**章节域**种子数据（首启唯一书籍「Writer's Forge · 使用指南」的卷 / 章）。
 *
 * 组织结构：**卷 = 功能分区**（正文卷，自动「卷X」编号），**章 = 具体功能**；
 * 每章正文以块级 JSON 表达（加粗引导句 + bulletList 要点 + 段落——章节页按纯段落
 * 口径渲染，heading 会被降级成普通文字，故小节标题统一用加粗段落）。
 * 文案为中文硬编码（主进程种子属不译项，AGENTS §10）。
 *
 * 拆分说明（§3 单文件 ≤500 行）：本文件只承载**卷序**与**书籍元信息**；各卷正文按
 * 「卷 = 功能分区」分文件：卷一 `./volumesStart.ts`、卷二 `./volumesChapters.ts`、
 * 卷三 `./volumesOutline.ts`、卷四 `./volumesStory.ts`、卷五 `./volumesEntities.ts`
 * （后 3 章在 `./volumesSubtypes.ts`）、卷六 `./volumesThreads.ts`、卷七 `./volumesAi.ts`、
 * 卷八 `./volumesInterface.ts`、卷九 `./volumesBackup.ts`、卷十 `./volumesSettings.ts`。
 * 大纲教学数据在 `./outline.ts`，`seedGuideBook.ts` 仅做聚合导出。
 *
 * ⚠️ 当前为**骨架批次**：卷一「开始使用」已完整撰写，其余九卷先登记卷序与卷名
 * （`chapters: []`），由后续批次逐卷填充。空卷在章节树中显示为无章节的卷卡，不影响
 * 渲染与数据读写；后续批次只需往对应文件的 `chapters` 数组追加章节。
 *
 * ⚠️ 维护约定（AGENTS §7.5）：**新增功能与不兼容变更必须同步更新对应卷文件**，
 * 保证首次启动的教学书始终反映当前功能集，且教学文案与实际交互（按钮、快捷键、
 * 范围、默认值）逐条一致。
 */

/** 卷一「开始使用」。 */
import { VOLUME_START } from './volumesStart'

/** 卷二「章节写作」。 */
import { VOLUME_CHAPTERS } from './volumesChapters'

/** 卷三「大纲」；re-export 保持聚合入口稳定。 */
import { VOLUME_OUTLINE } from './volumesOutline'
export { VOLUME_OUTLINE } from './volumesOutline'

/** 卷四「剧情与时间线」。 */
import { VOLUME_STORY } from './volumesStory'

/** 卷五「设定档案」前半；后 3 章由 `./volumesSubtypes.ts` 展开进本卷。 */
import { VOLUME_ENTITIES } from './volumesEntities'

/** 卷六「伏笔与灵感」。 */
import { VOLUME_THREADS } from './volumesThreads'

/** 卷七「AI 助手」。 */
import { VOLUME_AI } from './volumesAi'

/** 卷八「界面与外观」。 */
import { VOLUME_INTERFACE } from './volumesInterface'

/** 卷九「备份」。 */
import { VOLUME_BACKUP } from './volumesBackup'

/** 卷十「设置与快捷键」；re-export 保持聚合入口稳定。 */
import { VOLUME_SETTINGS } from './volumesSettings'
export { VOLUME_SETTINGS } from './volumesSettings'

/**
 * 教学书全部卷（分区）：数组顺序即章节树顺序。
 *
 * `SeedVolume` 没有 `order` 字段——卷序完全由本数组下标决定：1 开始使用、
 * 2 章节写作、3 大纲、4 剧情与时间线、5 设定档案、6 伏笔与灵感、7 AI 助手、
 * 8 界面与外观、9 备份、10 设置与快捷键。
 */
export const GUIDE_VOLUMES: readonly SeedVolume[] = [
  // 1
  VOLUME_START,
  // 2
  VOLUME_CHAPTERS,
  // 3
  VOLUME_OUTLINE,
  // 4
  VOLUME_STORY,
  // 5
  VOLUME_ENTITIES,
  // 6
  VOLUME_THREADS,
  // 7
  VOLUME_AI,
  // 8
  VOLUME_INTERFACE,
  // 9
  VOLUME_BACKUP,
  // 10
  VOLUME_SETTINGS
]

/**
 * 教学书元信息（书名 / 作者 / 书籍简介 / 封面）。
 *
 * `categories` 为**分类 ID 列表**（`categories.id`）：官方 ID 由 `categories` 表自增决定
 * （灌入顺序相关），静态常量无法预知，故教学书留空 `[]`（分类树选法已在正文「书架」章
 * 讲解，本书自身不预选分类；旧版自定义分类管理入口已移除，分类只读官方树）。
 */
export const GUIDE_BOOK = {
  /** 固定 id，便于实体种子等模块显式引用。 */
  id: 'guide',
  title: "Writer's Forge · 使用指南",
  intro:
    "第一次使用「Writer's Forge」？这本指南按十大功能分区编排：从首启笔名与书架管理，到章节写作、大纲、剧情时间线、设定档案、伏笔灵感、AI 助手、界面外观、备份与设置。每个功能单独成章，按「入口 → 步骤 → 默认值 → 注意」讲清，读完可随时删除本书。",
  categories: [] as number[],
  status: 'writing' as const,
  coverColor: 'teal'
}
