/**
 * 机翻占位 · 待校
 * 灵感命名空间（`inspiration`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 inspiration.ts 全等：由本文件 `satisfies ZhCNResources['inspiration']` 与 en/writerResources.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const inspiration = {
  emptyTitle: 'No inspiration yet',
  emptyDesc: 'Click “+” in the title bar to create one and jot down fragments and ideas',
  emptyFilteredTitle: 'No inspiration matches the current filter',
  emptyFilteredDesc:
    'Change the tag in the activity bar filter popover, or clear the search keyword',
  filter: {
    all: 'All',
    tagAria: 'Filter by tag',
    searchPlaceholder: 'Search titles, content or tags',
    searchAria: 'Search titles, content or tags',
    search: 'Search'
  },
  field: {
    untitled: 'Untitled inspiration',
    title: 'Title',
    titlePlaceholder: 'Name this inspiration',
    content: 'Content',
    contentPlaceholder: 'Jot down a fragment, thought or line',
    contentEmpty: 'No content',
    tags: 'Tags',
    tagsPlaceholder: 'Type a tag and press Enter',
    tagsHint: 'Up to {{max}} tags; press Enter or comma to add'
  },
  detail: {
    emptyTitle: 'No inspiration selected',
    emptyDesc: 'Select an inspiration in the list to view and edit its details',
    back: 'Back to inspiration list'
  },
  overview: {
    empty: 'No inspiration in this book yet'
  },
  action: {
    create: 'New inspiration',
    delete: 'Delete'
  },
  dialog: {
    delete: {
      title: 'Delete inspiration',
      message: 'Delete “{{title}}”? This permanently deletes it and cannot be undone.',
      confirm: 'Delete'
    },
    unsavedSwitch: {
      title: 'Unsaved changes',
      message:
        'The current inspiration has unsaved changes. Choose “Save” to store them first, or “Don’t save” to discard them and continue.',
      discard: 'Don’t save'
    }
  },
  toast: {
    createSuccess: 'Inspiration created',
    createFailed: 'Failed to create inspiration. Please try again',
    saveSuccess: 'Inspiration saved',
    saveFailed: 'Failed to save inspiration. Please try again',
    deleteSuccess: 'Inspiration deleted',
    deleteFailed: 'Failed to delete inspiration. Please try again'
  }
} satisfies ZhCNResources['inspiration']

export default inspiration
