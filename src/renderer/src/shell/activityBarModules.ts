import { useTranslation } from 'react-i18next'

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

/** 活动栏模块清单（顺序即渲染顺序）：章节 / 大纲 / 剧情 / 世界观 / 角色 / 势力 /
 *  境界体系 / 物品功法 / 时间线 / 伏笔 / 灵感。 */
export const WRITER_MODULES: readonly WriterModule[] = [
  'chapters',
  'outline',
  'plot',
  'worldview',
  'characters',
  'factions',
  'power_system',
  'items',
  'timeline',
  'foreshadow',
  'inspiration'
]
