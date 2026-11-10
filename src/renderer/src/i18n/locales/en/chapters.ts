/**
 * 机翻占位 · 待校
 * 章节模块命名空间（`chapters`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 chapters.ts 全等：由本文件 `satisfies ZhCNResources['chapters']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const chapters = {
  status: {
    draft: 'Draft',
    done: 'Final'
  },
  numbering: {
    chapterPrefix: 'Chapter {{n}}',
    volumePrefix: 'Volume {{n}}',
    statusPosition: 'Chapter {{index}} of {{total}}',
    statusTotal: '{{total}} chapters in total'
  },
  volume: {
    unfiled: 'Unfiled'
  },
  statusToggleAria: 'Chapter status: {{label}} (click to toggle)',
  newVolume: 'New Volume',
  newVolumeTooltip: 'New volume (body volume / custom volume)',
  pinTop: 'Pin to top',
  pinBottom: 'Pin to bottom',
  deleteChapter: 'Delete chapter',
  dragReorder: 'Drag to reorder / move across volumes',
  rename: 'Rename',
  namePlaceholder: 'Edit',
  volumeFull: 'Volume is at maximum capacity',
  newChapter: 'New chapter',
  newSpecialChapter: 'New special chapter',
  deleteVolume: 'Delete volume',
  specialVolumeNameAria: 'Special volume name',
  customVolumeNameAria: 'Volume custom name',
  emptyTitle: 'No volumes yet',
  emptyDesc: 'Click “New Volume” in the top bar to create one',
  editor: {
    lastEdited: 'Last edited {{time}}',
    copyAll: 'Copy full text (plain text, title excluded)',
    copyAllButton: 'Copy full text',
    copyDone: 'Full text copied',
    copyFailed: 'Copy failed, please try again',
    copyEmpty: 'The chapter body is empty, nothing to copy',
    footCount: 'This chapter: <b>{{count}}</b> / <b>{{limit}}</b> chars',
    wordLimitNear: 'Approaching the per-piece word limit',
    wordLimitReached: 'Per-piece word limit reached'
  },
  proofread: {
    hits: '{{count}} prohibited terms',
    hitsTitle: 'Number of prohibited-term matches in the text (hint only, never blocks writing)'
  },
  cleanWords: {
    button: 'Prohibited words',
    buttonTooltip: 'Prohibited words (built-in / mine)',
    dialogTitle: 'Prohibited words',
    toggleFailed: 'Failed to save the enabled state',
    deleteFailed: 'Delete failed',
    deleteConfirmTitle: 'Delete word',
    deleteConfirmMessage: 'Delete “{{word}}”? This cannot be undone.',
    deleteDone: 'Deleted “{{word}}”',
    sourceAria: 'Filter by source',
    sourceAll: 'All',
    sourceBuiltin: 'Built-in',
    sourceUser: 'Mine',
    categoryAria: 'Filter by category',
    categoryAll: 'All categories',
    category: {
      sexual: 'Sexual',
      minorSexual: 'Minor sexual',
      gambling: 'Gambling',
      drug: 'Drugs',
      fraud: 'Fraud',
      violence: 'Violence',
      weapon: 'Weapons',
      minor: 'Minor',
      other: 'Other'
    },
    hoverCategory: 'Type: {{category}}',
    searchAria: 'Search words',
    searchPlaceholder: 'Search words',
    countSummary: 'Showing {{shown}} / {{total}} · Built-in {{builtin}} · Mine {{user}}',
    addCategoryAria: 'New word category',
    addWordAria: 'New word content',
    addWordPlaceholder: 'Enter a word to add',
    addConfirm: 'Add',
    addDone: 'Added “{{word}}”',
    addUpdated: 'Word already exists; category updated',
    addExists: '“{{word}}” already exists; no need to add it again',
    addFailed: 'Failed to add, please retry',
    addWordTooShort: 'A word needs at least 2 characters',
    addWordTooLong: 'A word can have at most {{max}} characters',
    addWordMultiline: 'A word cannot contain line breaks',
    loading: 'Loading the word list…',
    loadFailed: 'Failed to load the word list',
    empty: 'No matching words',
    emptyFilterDesc: 'Try loosening the source, category, or keyword filter',
    emptyNoWords: 'No words yet',
    emptyNoWordsDesc: 'Use the “Add” row below to create your own words',
    showMore: 'Show more ({{rest}} left)',
    toggleAria: 'Enable or disable “{{word}}”',
    delete: 'Delete',
    deleteAria: 'Delete “{{word}}”',
    statusBarAria: 'Prohibited words: {{hits}} matches (click to view this chapter’s hit list)',
    hitListTitle: '{{total}} matches in this chapter across {{words}} words',
    hitTimes: '{{count}} times',
    openLibrary: 'Open prohibited words',
    metaLine: 'Source: {{source}} ({{license}}) · fetched on {{date}}'
  },
  search: {
    aria: 'Chapter search and replace',
    title: 'Find and replace',
    close: 'Close search',
    rangeAria: 'Search range',
    searching: 'Searching…',
    count: '{{total}} matches',
    empty: 'No matches',
    placeholderSearch: 'Search',
    ariaSearch: 'Search content',
    placeholderReplace: 'Replace with',
    ariaReplace: 'Replace content',
    replace: 'Replace',
    replaceAll: 'Replace all',
    replaceHere: 'Replace here',
    scopeChapter: 'This chapter',
    scopeBook: 'Whole book',
    truncated:
      'Too many results; the list shows only the first part ({{total}} total). “Replace all” still processes every match in range.',
    errorSearch: 'Search failed',
    staleHit: 'This spot has changed, please search again',
    errorReplace: 'Replace failed',
    errorReplaceAll: 'Replace all failed'
  },
  trash: {
    title: 'Trash',
    count: '{{total}} items',
    purgeAll: 'Empty trash',
    empty: 'Trash is empty',
    groupVolumes: 'Volumes',
    groupChapters: 'Chapters',
    groupCustom: 'Custom',
    groupBody: 'Body',
    orphanVolume: 'Original volume deleted',
    unfiledVolume: 'Unfiled',
    untitledChapter: 'Untitled chapter',
    restoreVolume: 'Restore volume',
    purgeVolume: 'Delete volume permanently',
    restoreChapter: 'Restore chapter',
    purgeChapter: 'Delete chapter permanently',
    restoreAfterVolume: 'Restore the parent volume first',
    detail: {
      empty: 'Select an item on the left to view details',
      deletedAt: 'Deleted {{time}}',
      wordCount: '{{value}} chars',
      status: 'Status {{status}}',
      originalVolume: 'Volume {{name}}',
      volumeInTrash: 'The original volume is also in the trash',
      chapterVolumeInTrash:
        'The original volume is also in the trash; restoring will move this chapter to Unfiled',
      restoreToVolume: 'Will be restored to the end of the original volume',
      restoreToUnfiled: 'Will be restored to the end of Unfiled',
      loading: 'Loading content…',
      loadFailed: 'Failed to load content',
      retry: 'Retry',
      noContent: '(No content)',
      volumeKind: 'Type {{kind}}',
      volumeKindNormal: 'Body volume',
      volumeKindCustom: 'Custom volume',
      volumeKindGroup: 'Group',
      volumeNotDeleted: 'Not deleted (collecting only)',
      volumeLiveNotice:
        'This volume is not deleted; its chapters will return to the end of the volume when restored',
      volumeDeletedNotice:
        'Restoring will return the volume and its chapters to the end of the volume; the matching outline entries will also be restored',
      deletedChapters: '{{value}} chapters in trash',
      deletedItems: '{{value}} entries in trash',
      standalone: 'Standalone entry',
      untitledVolume: 'Untitled volume'
    }
  },
  newVolumeDialog: {
    title: 'New Volume',
    typeAria: 'Volume type',
    normal: 'Body volume',
    custom: 'Custom volume',
    customNameLabel: 'Custom volume name',
    customNamePlaceholder: 'e.g. Rising Wind (optional)',
    nameLabel: 'Volume name',
    namePlaceholder: 'e.g. Side stories / About the work'
  },
  specialChapterDialog: {
    title: 'New Special Chapter',
    prefixLabel: 'Prefix',
    prefixPlaceholder: 'e.g. Prologue',
    prefixRequired: 'Please enter a prefix (e.g. Prologue, Side story)',
    nameLabel: 'Chapter name',
    namePlaceholder: 'e.g. Sound of the Tide',
    nameRequired: 'Please enter a chapter name',
    positionLabel: 'Position',
    positionAria: 'Position',
    pinTop: 'Pin to top',
    pinBottom: 'Pin to bottom'
  },
  titleRow: {
    specialPrefixAria: 'Special chapter prefix (read-only)',
    specialNameAria: 'Special chapter name',
    titleAria: 'Chapter title'
  },
  dialog: {
    deleteVolume: {
      title: 'Delete volume',
      message:
        'Delete “{{name}}”? The volume and its chapters will be moved to the chapters trash; the matching volume and its entries in the outline will also be moved to the outline trash. Both can be restored.',
      messageWithImpact:
        'Delete “{{name}}”? The volume and its {{chapters}} chapters will be moved to the chapters trash; the matching volume and its {{outlineItems}} entries in the outline will also be moved to the outline trash. Both can be restored.',
      confirm: 'Delete'
    },
    deleteChapter: {
      title: 'Delete chapter',
      message: 'Delete “{{name}}”? It will be moved to the trash and can be restored.',
      confirm: 'Delete'
    },
    purgeVolume: {
      title: 'Delete volume permanently',
      message: '“{{name}}” and its chapters will be permanently deleted and cannot be recovered.',
      confirm: 'Delete permanently'
    },
    purgeChapter: {
      title: 'Delete chapter permanently',
      message: '“{{name}}” will be permanently deleted and cannot be recovered.',
      confirm: 'Delete permanently'
    },
    purgeAll: {
      title: 'Empty trash',
      message:
        'All volumes and chapters in the trash will be permanently deleted and cannot be recovered.',
      chapterMessage:
        'All chapters in the trash will be permanently deleted and cannot be recovered; deleted volumes and outline entries are not affected.',
      confirm: 'Empty'
    }
  }
} satisfies ZhCNResources['chapters']

export default chapters
