/**
 * 机翻占位 · 待校
 * 伏笔命名空间（`foreshadow`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 foreshadow.ts 全等：由本文件 `satisfies ZhCNResources['foreshadow']` 与 en/writerResources.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const foreshadow = {
  title: 'Foreshadowing',
  emptyTitle: 'No foreshadowing yet',
  emptyDesc: 'Select a passage in the text and choose “Add foreshadowing” from the context menu',
  listItem: {
    anchored: 'Anchored',
    unanchored: 'Not anchored',
    anchorInvalid: 'Anchor invalid',
    relatedEntities: 'Related entities',
    moreEntities: '{{n}} more related entities'
  },
  overview: {
    empty: 'No foreshadowing in this book yet'
  },
  anchor: {
    invalid: 'The source text has changed; the anchor is invalid',
    missing: 'Anchored text not found',
    chapter: 'Chapter · {{name}}',
    outline: 'Outline · {{name}}',
    unnamedTarget: 'Untitled item'
  },
  status: {
    drafting: 'In progress',
    planted: 'Planted',
    recovered: 'Recovered',
    abandoned: 'Abandoned'
  },
  mark: {
    heading: 'Foreshadowing: {{name}}',
    recoveredAt: 'Recovered at {{place}}',
    recovered: 'Recovered',
    plantedPlace: 'Planted at {{place}}',
    pending: 'Pending recovery',
    abandoned: 'Abandoned',
    secondary: 'Outline planting point · {{status}}',
    unknownPlace: 'unknown location'
  },
  field: {
    name: 'Name',
    namePlaceholder: 'Give this foreshadowing a name',
    nameRequired: 'Name is required',
    untitled: 'Untitled foreshadowing',
    context: 'Linked to',
    contextUnlinked: 'Not linked',
    selectedText: 'Selected text',
    selectedTextEmpty: 'No text selected',
    description: 'Description',
    descriptionPlaceholder: 'Describe the intent, how it pays off, and so on'
  },
  detail: {
    emptyTitle: 'No foreshadowing selected',
    emptyDesc: 'Select a foreshadowing entry in the list to view and edit its details',
    plant: 'Body planting point',
    plant2: 'Outline planting point',
    remove: 'Remove',
    plantEmpty: 'Not anchored',
    recover: 'Recovery location',
    recoverEmpty: 'Not recovered',
    recoverNote: 'Recovery note',
    abandon: 'Abandon',
    restore: 'Restore',
    abandonRecoveredHint: 'Recovered foreshadowing cannot be abandoned',
    removeRecoveredHint:
      'Recovered foreshadowing cannot have its planting point removed; remove the recovery location first'
  },
  dialog: {
    createTitle: 'New foreshadowing',
    editTitle: 'Edit foreshadowing',
    unsavedSwitch: {
      title: 'Unsaved changes',
      message:
        'The current foreshadowing has unsaved changes. Choose “Save” to store them before continuing, or “Don’t save” to discard them.',
      discard: 'Don’t save'
    },
    delete: {
      title: 'Delete foreshadowing',
      message: 'Delete “{{title}}”? This cannot be undone.',
      confirm: 'Delete'
    },
    removeAnchor2: {
      title: 'Remove outline planting point',
      message:
        'Remove the outline planting point of this foreshadowing? Its quoted text and position snapshot will be cleared.',
      confirm: 'Remove'
    },
    removeBody: {
      title: 'Remove body planting point',
      message:
        'Remove the body planting point of this foreshadowing? Its quoted text and position snapshot will be cleared.',
      confirm: 'Remove'
    },
    removeRecover: {
      title: 'Remove recovery location',
      message:
        'Remove the recovery location of this foreshadowing? Its quoted text and position snapshot will be cleared, and the status will be recalculated from the remaining anchors.',
      confirm: 'Remove'
    }
  },
  deleteImpact: {
    soft: 'Double-planted foreshadowing detected: {{titles}}. After deletion, the planting point here will become invalid, but the foreshadowing entry and its other planting point will remain. You can view it in the “Foreshadowing” module.',
    purge:
      'Double-planted foreshadowing detected: {{titles}}. Permanently deleting will remove these foreshadowing entries entirely, including their other planting points, with no way to recover them.',
    separator: ', ',
    more: '{{titles}} and {{count}} more'
  },
  action: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete'
  },
  toast: {
    createSuccess: 'Foreshadowing created',
    createFailed: 'Failed to create foreshadowing. Please try again',
    updateSuccess: 'Foreshadowing saved',
    updateFailed: 'Failed to save foreshadowing. Please try again',
    clearAnchorFailed: 'Failed to remove. Please try again',
    recoverSuccess: 'Foreshadowing recovered',
    recoverFailed: 'Failed to recover foreshadowing. Please try again',
    abandonSuccess: 'Foreshadowing abandoned',
    restoreSuccess: 'Foreshadowing restored',
    deleteSuccess: 'Foreshadowing deleted',
    deleteFailed: 'Failed to delete foreshadowing. Please try again'
  },
  recover: {
    title: 'Recover foreshadowing',
    searchPlaceholder: 'Search foreshadowing by name',
    listLabel: 'Foreshadowing available to recover',
    empty: 'No foreshadowing available to recover',
    noResult: 'No matching foreshadowing',
    loadFailed: 'Failed to load foreshadowing. Close and try again',
    noteLabel: 'Recovery note',
    notePlaceholder: 'Describe how this foreshadowing pays off (optional)',
    submit: 'Recover'
  },
  attach: {
    title: 'Link foreshadowing',
    searchPlaceholder: 'Search foreshadowing by name',
    listLabel: 'Foreshadowing available to link',
    empty: 'No foreshadowing can be linked',
    noResult: 'No matching foreshadowing',
    loadFailed: 'Failed to load foreshadowing. Close and try again',
    submit: 'Link',
    success: 'Planting point linked',
    full: 'This foreshadowing already has two planting locations',
    failed: 'Failed to link. Please try again'
  },
  contextMenu: {
    add: 'Add foreshadowing',
    attach: 'Link foreshadowing',
    recover: 'Recover foreshadowing',
    hint: 'Right-click with text selected to use it as the anchor',
    noSelection: 'Please select a passage first'
  }
} satisfies ZhCNResources['foreshadow']

export default foreshadow
