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
    descLabel: 'Starting-point description',
    descPlaceholder: 'e.g. The story begins here'
  },
  originTitle: 'Origin',
  originNameLabel: 'Origin name',
  originDefault: 'Year One',
  originNote: 'The story began',
  readonlyNote: 'Read-only · excluded from plot line counts and ordering',
  originDescLabel: 'Starting-point description',
  originPlaceholder: 'e.g. The story begins here',
  rename: 'Rename',
  delete: 'Delete',
  deleteLastDisabled: 'Keep at least one timeline',
  deleteBlocked:
    'This timeline still has {{count}} plot line(s). Delete or move them to another timeline first',
  renameFailed: 'Rename failed. Please try again.',
  deleteFailed: 'Delete failed. Please try again.',
  dialog: {
    delete: {
      title: 'Delete timeline',
      message: 'Delete the timeline “{{name}}”? This cannot be undone.',
      confirm: 'Delete'
    }
  },
  timelineSelect: {
    label: 'Timeline',
    placeholder: 'Select timeline'
  },
  plotEmpty: 'No plot scenes yet',
  sceneBodyEmpty: 'This scene has no body yet'
} satisfies ZhCNResources['timeline']

export default timeline
