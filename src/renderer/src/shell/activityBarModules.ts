import { useTranslation } from 'react-i18next'
import type { WorldEntityType } from '../../../preload/types/worldEntity'

/** 写作模块标识（活动栏可在其间切换）。 */
export type WriterModule =
  | 'chapters'
  | 'outline'
  | 'plot'
  | 'worldview'
  | 'characters'
  | 'factions'
  | 'power_system'
  | 'items'
  | 'timeline'
  | 'foreshadow'
  | 'inspiration'

/**
 * 模块名（i18n）：键即模块 id，展示名取自 `module` 命名空间，随界面语言切换。
 *
 * 命名说明：`worldview` 承载「世界观」，语义为世界观 / 设定条目，
 * 刻意避开 `settings`（易与「应用设置」混淆）；其余 id 取英文语义名
 * `plot` / `characters` / `factions` / `power_system` / `items` / `timeline` /
 * `foreshadow` / `inspiration`（`items` 承载「物品功法」，即物品与功法条目）。
 */
export function useModuleLabel(id: WriterModule): string {
  const { t } = useTranslation('module')
  return t(id)
}

/**
 * 设定档案模块 id（活动栏中五个实体模块）。
 *
 * 真源收敛在 shell 层：活动栏浮层（`ActivityBarFilterPopover`）需要
 * `MODULE_ENTITY_TYPE` 去拉子类，而它原先定义在 `pages/writer/dossier/dossierTree.ts`——
 * shell 反向 import 会形成分层倒置，故把「域清单 + 模块 → 实体类型 + 守卫」统一放在本文件，
 * 由 `dossierTree.ts` 原路径转出（既有引用不变）。
 */
export type DossierModule = 'worldview' | 'characters' | 'factions' | 'power_system' | 'items'

/** 五域模块清单（顺序即活动栏中实体模块的渲染顺序）。 */
export const DOSSIER_MODULES: readonly DossierModule[] = [
  'worldview',
  'characters',
  'factions',
  'power_system',
  'items'
]

/** 模块 → 统一设定库实体类型（数据层 `entity_type`）。 */
export const MODULE_ENTITY_TYPE: Record<DossierModule, WorldEntityType> = {
  worldview: 'worldview',
  characters: 'character',
  factions: 'faction',
  power_system: 'power_system',
  items: 'item'
}

/** 判定模块是否属设定档案五域。 */
export function isDossierModule(module: WriterModule): module is DossierModule {
  return (DOSSIER_MODULES as readonly WriterModule[]).includes(module)
}

/** 活动栏模块清单（顺序即渲染顺序）：章节 / 大纲 / 剧情 / 世界观 / 角色 / 势力 /
 *  境界体系 / 物品功法 / 时间线 / 伏笔 / 灵感。实体模块段落直接展开 `DOSSIER_MODULES`，
 *  避免同一顺序维护两份清单。 */
export const WRITER_MODULES: readonly WriterModule[] = [
  'chapters',
  'outline',
  'plot',
  ...DOSSIER_MODULES,
  'timeline',
  'foreshadow',
  'inspiration'
]
