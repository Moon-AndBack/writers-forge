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
    anchorInvalid: 'Anchor invalid'
  },
  anchor: {
    invalid: 'The source text has changed; the anchor is invalid',
    missing: 'Anchored text not found',
    chapter: 'Chapter · {{name}}',
    outline: 'Outline · {{name}}',
    unnamedTarget: 'Untitled item'
  },
  status: {
    planted: 'Planted',
    recovered: 'Recovered',
    abandoned: 'Abandoned'
  },
  mark: {
    recoveredAt: 'Recovered at {{place}}',
    recovered: 'Recovered',
    plantedAt: 'Planted at {{place}} · {{title}}',
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
    descriptionPlaceholder: 'Describe the intent, how it pays off, and so on',
    status: 'Status'
  },
  detail: {
    emptyTitle: 'No foreshadowing selected',
    emptyDesc: 'Select a foreshadowing entry in the list to view and edit its details',
    plant: 'Planting location',
    plantEmpty: 'Not anchored',
    recover: 'Recovery location',
    recoverEmpty: 'Not recovered',
    recoverNote: 'Recovery note'
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
    }
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
    recoverSuccess: 'Foreshadowing recovered',
    recoverFailed: 'Failed to recover foreshadowing. Please try again',
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
  contextMenu: {
    add: 'Add foreshadowing',
    recover: 'Recover foreshadowing',
    hint: 'Right-click with text selected to use it as the anchor',
    noSelection: 'Please select a passage first'
  }
} satisfies ZhCNResources['foreshadow']

export default foreshadow
