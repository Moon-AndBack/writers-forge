import type { IconInput } from 'morphicons/react'
import {
  BookOpen,
  BookOpenCheck,
  Bookmark,
  BookmarkCheck,
  Clock,
  ClockCheck,
  Earth,
  GitBranch,
  Globe,
  Layers,
  Layers2,
  ListChecks,
  ListTree,
  Package,
  PackageCheck,
  Shield,
  ShieldCheck,
  Sparkle,
  Sparkles,
  UserRound,
  UserRoundCheck,
  Workflow
} from 'lucide'
import type { WriterModule } from './activityBar'

/**
 * 模块栏图标形变对（未选中 / 选中）。
 *
 * 与 `morphIcons.ts`（标题栏）同范式：图标以 Lucide `IconNode` 数据形式引入，
 * 由 `morphicons` 的 `<MorphIcon>` 作为单个路径渲染；切换模块时，新选中模块
 * 的图标从 `idle` 形变到 `active`，取消选中的模块反向形变。形变由 SVG `d`
 * 插值完成，不使用 CSS transform。
 *
 * 选型原则：
 * - 语义先正确（书本 → 章节、树状列表 → 大纲、节点图 → 剧情……）；
 * - 两态图形差异要肉眼可辨（加勾 / 加层 / 展开 / 换图），否则形变不可见；
 * - 统一朝「选中 = 带确认标记或更完整形态」的方向演进，保持整体语言一致。
 *
 * 只导入用到的图标：Vite 依据 `lucide` 的 `sideEffects: false` + 具名导入做
 * tree-shaking，不会把整包打进产物。
 */
export interface ModuleMorphIcons {
  /** 未选中态图标。 */
  idle: IconInput
  /** 选中态图标（与 `idle` 之间存在可见形变）。 */
  active: IconInput
}

/** 11 个写作模块各自的图标对（顺序无关，键即 `WriterModule`）。 */
export const MODULE_MORPH_ICONS: Record<WriterModule, ModuleMorphIcons> = {
  // 章节：合起的书 → 书 + 勾。
  chapters: { idle: BookOpen, active: BookOpenCheck },
  // 大纲：树状层级列表 → 带勾的清单（层级落到条目）。
  outline: { idle: ListTree, active: ListChecks },
  // 剧情：分支节点 → 连线流程（情节推进）。
  plot: { idle: GitBranch, active: Workflow },
  // 世界观：经纬地球 → 大陆地球（同一语义的更完整形态）。
  worldview: { idle: Globe, active: Earth },
  // 角色：单个人物 → 人物 + 勾。
  characters: { idle: UserRound, active: UserRoundCheck },
  // 势力：盾牌 → 盾牌 + 勾（阵营徽记）。
  factions: { idle: Shield, active: ShieldCheck },
  // 境界体系：两层 → 三层（层级递进、境界抬升）。
  power_system: { idle: Layers2, active: Layers },
  // 物品功法：包裹 → 包裹 + 勾。
  items: { idle: Package, active: PackageCheck },
  // 时间线：时钟 → 时钟 + 勾（当前进度已标记）。
  timeline: { idle: Clock, active: ClockCheck },
  // 伏笔：书签 → 书签 + 勾。
  foreshadow: { idle: Bookmark, active: BookmarkCheck },
  // 灵感：双星 → 单星（火花聚拢）。
  inspiration: { idle: Sparkles, active: Sparkle }
}
