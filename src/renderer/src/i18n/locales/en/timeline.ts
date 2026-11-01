/**
 * 机翻占位 · 待校
 * 独立时间线命名空间（`timeline`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 timeline.ts 全等：由本文件 `satisfies ZhCNResources['timeline']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const timeline = {
  title: 'Main timeline',
  defaultName: 'Main timeline',
  emptyTitle: 'No timelines yet',
  emptyDesc: 'Click “Add timeline” in the title bar to create one',
  newTimeline: 'Add timeline',
  newDialog: {
    title: 'New timeline',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Main timeline',
    originLabel: 'Origin',
    originPlaceholder: 'e.g. Year One'
  },
  originLabel: 'Origin',
  originTitle: 'Origin',
  originDefault: 'Year One',
  originDesc:
    'Start time of the read-only main timeline, default “Year One”; editable in the right pane.',
  originNote: 'The story began',
  readonlyNote: 'Read-only · excluded from plot line counts and ordering',
  originAria: 'Timeline origin',
  originPlaceholder: 'e.g. Year One',
  originSave: 'Save origin',
  originSaved: 'Saved',
  originEmpty: 'Shows “Year One” when no origin is set',
  timelineSelect: {
    label: 'Timeline',
    placeholder: 'Select timeline'
  },
  plotEmpty: 'No plot scenes yet',
  sceneBodyEmpty: 'This scene has no body yet',
  /* Status bar “card size” control (4 levels; numeric levels show their literal value, only “unlimited” is translated). */
  cardSize: {
    minWidth: 'Min width',
    maxWidth: 'Max width',
    minHeight: 'Min height',
    maxHeight: 'Max height',
    none: 'Unlimited',
    pill: {
      minWidth: 'W ≥ {{value}}',
      maxWidth: 'W ≤ {{value}}',
      minHeight: 'H ≥ {{value}}',
      maxHeight: 'H ≤ {{value}}'
    }
  }
} satisfies ZhCNResources['timeline']

export default timeline
