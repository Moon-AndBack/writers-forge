/**
 * 机翻占位 · 待校
 * 大纲命名空间（`outline`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 outline.ts 全等：由本文件 `satisfies ZhCNResources['outline']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const outline = {
  emptyTitle: 'No volumes yet',
  emptyDesc: 'Click “Add” in the top bar to start building the outline',
  add: 'Add',
  newVolume: 'New volume',
  volumeNameAria: 'Volume name',
  titleAria: 'Outline title',
  expandVolumeAria: 'Expand / collapse volume',
  dragWithinVolume: 'Drag to reorder (within volume)',
  newChapter: 'New chapter',
  newNonVolumeChapter: 'New entry',
  newGroup: 'New group',
  newChapterInGroup: 'New entry in group',
  rename: 'Rename',
  deleteVolume: 'Delete volume',
  deleteChapter: 'Delete chapter',
  deleteGroup: 'Delete group',
  footCount: 'This entry: <b>{{count}}</b> / <b>{{limit}}</b> chars',
  emptySelect: 'Select an outline entry on the left to edit',
  emptySelectHint: 'Click any entry in the outline tree to write its content here',
  unnamedVolume: 'Untitled volume',
  unnamedChapter: 'Untitled chapter',
  unnamedGroup: 'Untitled group',
  groupNameAria: 'Group name',
  createDialog: {
    typeAria: 'Create type',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Main plot / Volume Rising (optional)'
  },
  dialog: {
    deleteVolume: {
      title: 'Delete volume',
      message: 'Delete “{{name}}”? Its chapters will be deleted as well.',
      confirm: 'Delete'
    },
    deleteChapter: {
      title: 'Delete chapter',
      message: 'Delete “{{name}}”?',
      confirm: 'Delete'
    },
    deleteGroup: {
      title: 'Delete group',
      message: 'Delete “{{name}}”? Its entries will be deleted as well.',
      confirm: 'Delete'
    }
  },
  search: {
    aria: 'Find and replace (current entry)',
    title: 'Find and replace',
    close: 'Close search',
    placeholderSearch: 'Search (current entry only)',
    ariaSearch: 'Search content',
    placeholderReplace: 'Replace with',
    ariaReplace: 'Replace content',
    prev: 'Previous',
    next: 'Next',
    replace: 'Replace',
    replaceAll: 'Replace all',
    none: 'No match',
    count: 'Match {{index}}/{{total}}',
    noMatch: 'No matches'
  }
} satisfies ZhCNResources['outline']

export default outline
