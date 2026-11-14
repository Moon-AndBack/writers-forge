/**
 * 机翻占位 · 待校
 * 书架命名空间（`bookshelf`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 bookshelf.ts 全等：由本文件 `satisfies ZhCNResources['bookshelf']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const bookshelf = {
  newBook: 'New Book',
  defaultAuthor: 'Anonymous',
  filter: {
    all: 'All',
    writing: 'Ongoing',
    done: 'Completed',
    draft: 'Draft',
    paused: 'Paused',
    dropped: 'Discontinued',
    revising: 'Revising',
    aria: 'Filter books by status'
  },
  sort: {
    recent: 'Recently edited',
    words: 'Most words',
    chapters: 'Most chapters',
    title: 'Title',
    fallback: 'Sort',
    tooltip: 'Sort by'
  },
  search: {
    aria: 'Search by title',
    placeholder: 'Search title…'
  },
  status: {
    writing: 'Ongoing',
    done: 'Completed',
    draft: 'Draft',
    paused: 'Paused',
    dropped: 'Discontinued',
    revising: 'Revising',
    bookCount: '<b>{{count}} books</b>',
    totalWords: 'Total words <b>{{value}}</b>',
    todayWords: 'Written today <b>{{value}}</b> chars',
    streak: '<b>{{count}}</b>-day streak'
  },
  channel: {
    male: 'Male-oriented',
    female: 'Female-oriented',
    publish: 'Publishing'
  },
  length: {
    long: 'Long',
    medium: 'Medium',
    short: 'Short'
  },
  categoryTree: {
    loading: 'Loading categories…',
    loadError: 'Failed to load categories',
    retry: 'Retry',
    parentAria: 'Parent category',
    childAria: 'Subcategory',
    parentPlaceholder: 'Choose a parent category',
    childPlaceholder: 'Choose a subcategory',
    childNoParent: 'Choose a parent category first',
    noChildren: 'No subcategories',
    add: 'Add'
  },
  card: {
    ariaLabel: '{{title}}, {{status}}',
    editAria: 'Edit {{title}}',
    deleteAria: 'Delete {{title}}',
    progressAria: '{{title}} writing progress',
    chapterCount: '{{count}} chapters',
    coverCharFallback: 'B'
  },
  form: {
    titleCreate: 'New Book',
    titleEdit: 'Edit Book',
    submitCreate: 'Create',
    submitEdit: 'Save',
    title: 'Title',
    titleRequired: 'Please enter a title',
    titlePlaceholder: 'e.g. Mist over Nanyu',
    intro: 'Synopsis',
    introPlaceholder: 'Sum up this book’s story in one sentence…',
    categories: 'Categories',
    categoriesHint:
      'Pick a parent / subcategory, then click Add; without a channel only “My categories” are available',
    categoriesAria: 'Categories (multiple allowed)',
    unset: 'Not set',
    status: 'Status',
    statusAria: 'Writing status',
    channel: 'Channel',
    channelHint: 'Optional; switching channel clears selected categories',
    channelAria: 'Channel',
    lengthType: 'Length',
    lengthHint: 'Optional',
    lengthAria: 'Length',
    coverColor: 'Cover color',
    coverHint: 'Cover letter uses the first character of the title',
    coverColorAria: 'Cover color',
    coverPreviewAlt: 'Cover preview',
    coverCharFallback: 'B',
    pickCover: 'Choose cover image',
    removeCover: 'Remove cover image'
  },
  dialog: {
    deleteBook: {
      title: 'Delete Book',
      message:
        'Delete “{{title}}”? Its chapters and text will be permanently deleted and cannot be recovered.',
      confirm: 'Delete'
    },
    bookDeletedToast: 'Deleted “{{title}}”',
    bookCreateFailedToast: 'Failed to create “{{title}}”. Please try again.',
    bookUpdateFailedToast: 'Failed to save “{{title}}”. Please try again.',
    bookDeleteFailedToast: 'Failed to delete “{{title}}”. Please try again.',
    bookCoverFailedToast: 'Failed to save the cover. Please try again.',
    thisBookFallback: 'this book'
  },
  wordCount: {
    wan: '{{value}} ×10⁴',
    wanBook: '{{value}} ×10⁴ words',
    chars: '{{value}} chars'
  }
} satisfies ZhCNResources['bookshelf']

export default bookshelf
