/**
 * 机翻占位 · 待校
 * 写作页命名空间（`writer`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 writer.ts 全等：由本文件 `satisfies ZhCNResources['writer']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const writer = {
  sidePaneAria: 'Sidebar',
  rightPaneAria: 'Right panel',
  rightTabs: {
    aria: 'Right pane tabs',
    outline: 'Outline',
    plot: 'Plot',
    ai: 'AI',
    foreshadow: 'Foreshadowing',
    inspiration: 'Inspiration'
  },
  rightOutline: {
    outlineLabel: 'Outline',
    detailLabel: 'Detailed outline',
    entryOption: 'Standalone entry · {{name}}',
    volumeOption: 'Volume · {{name}}',
    groupOption: 'Group · {{name}}',
    empty: 'No outline content yet',
    entryEmpty: 'This entry has no body yet',
    volumeEmpty: 'This volume has no outline yet',
    groupEmpty: 'This group has no outline yet',
    noDetail: 'This volume has no entries yet',
    groupNoDetail: 'This group has no entries yet'
  },
  rightPlot: {
    timelineFilterAria: 'Filter plot nodes by timeline',
    timelineAll: 'All timelines',
    lineFilterAria: 'Filter plot nodes by plot line',
    lineAll: 'All plot lines',
    filterEmpty: 'No plot nodes match the current filters',
    hoverEmpty: 'This node has no body text yet',
    lineEmpty: 'No plot lines in this timeline yet'
  },
  chapterPositionTitle: 'Position of the current chapter in the book’s normal chapter sequence'
} satisfies ZhCNResources['writer']

export default writer
