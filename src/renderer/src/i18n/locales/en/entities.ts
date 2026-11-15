/**
 * 机翻占位 · 待校
 * 实体命名空间（`entities`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 entities.ts 全等：由本文件 `satisfies ZhCNResources['entities']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const entities = {
  type: {
    worldview: 'Worldview',
    character: 'Character',
    item: 'Item',
    faction: 'Faction',
    power_system: 'Power system'
  },
  aliases: 'Aliases',
  tags: 'Tags',
  relations: 'Relations',
  firstAppearance: 'First appearance',
  firstAppearanceNone: 'Not yet appeared',
  notFound: 'Entity not found',
  overview: {
    empty: 'No settings entries in this book yet'
  },
  filter: {
    searchPlaceholder: 'Search name, alias, or category',
    searchAria: 'Search entities',
    moduleAll: 'All modules',
    moduleAria: 'Filter by module',
    subtypeAll: 'All subtypes',
    subtypeAria: 'Filter by subtype',
    noMatch: 'No matching entities'
  },
  detail: {
    back: 'Back',
    category: 'Category',
    bodyEmpty: 'No body text yet'
  }
} satisfies ZhCNResources['entities']

export default entities
