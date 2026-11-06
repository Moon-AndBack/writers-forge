/**
 * 机翻占位 · 待校
 * 剧情命名空间（`plot`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 plot.ts 全等：由本文件 `satisfies ZhCNResources['plot']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const plot = {
  newLine: 'New plot line',
  rename: 'Rename',
  emptyTitle: 'No plot lines yet',
  emptyDesc: 'Click “New plot line” below to start building the plot',
  deleteLine: 'Delete plot line',
  dialog: {
    deleteLine: {
      title: 'Delete plot line',
      message: 'Delete “{{name}}”? Its scene nodes will be deleted as well.',
      confirm: 'Delete'
    },
    deleteScene: {
      title: 'Delete node',
      message: 'Delete this plot node? This cannot be undone.',
      confirm: 'Delete'
    },
    unsavedSwitch: {
      title: 'Unsaved changes',
      message:
        'The changes to this node are not saved yet. Choose “Save” to save them before continuing, or “Don’t save” to continue and lose them.',
      discard: 'Don’t save'
    }
  },
  unnamedLine: 'Untitled plot line',
  createDialog: {
    title: 'New plot line',
    timelineLabel: 'Timeline',
    nameLabel: 'Name',
    namePlaceholder: 'Leave empty to show “Untitled plot line”',
    typeLabel: 'Type',
    colorLabel: 'Color'
  },
  editDialog: {
    title: 'Edit plot line'
  },
  nodeDialog: {
    createTitle: 'New plot node',
    editTitle: 'Edit plot node'
  },
  lineTypes: {
    main: 'Main',
    branch: 'Branch',
    romance: 'Romance',
    hidden: 'Hidden',
    sub: 'Sub',
    growth: 'Growth',
    world: 'World',
    suspense: 'Suspense'
  },
  lineColors: {
    purple: 'Violet',
    blue: 'Sky',
    green: 'Pine',
    orange: 'Amber',
    violet: 'Dusk',
    teal: 'Lake',
    rose: 'Crimson',
    slate: 'Slate',
    pink: 'Pink',
    coral: 'Coral',
    gold: 'Gold',
    lime: 'Lime',
    cyan: 'Cyan',
    indigo: 'Indigo',
    brown: 'Ochre',
    gray: 'Mist'
  },
  unnamedScene: 'Untitled node',
  undatedScene: 'Time undecided',
  timeline: {
    addNode: 'Add plot node',
    emptyLineTitle: 'No plot line selected',
    emptyLineDesc: 'Select or create a plot line on the left to arrange the scene timeline here',
    emptyNodes: 'This plot line has no nodes yet; click ＋ above to add one',
    editTime: 'Set time',
    editTitle: 'Set title',
    moreCharacters: '+{{n}}',
    moreCharactersTitle: '{{n}} more entities in this scene'
  },
  editor: {
    fieldTime: 'Time',
    fieldTimeEra: 'Era',
    fieldTimeYear: 'Year',
    fieldTimeDesc: 'Time description',
    fieldTitle: 'Title',
    timePlaceholder: 'e.g. Day 4 · Noon',
    timeYearPlaceholder: 'e.g. 3',
    eraUnset: 'Unset',
    titlePlaceholder: 'Plot title',
    contentPlaceholder: 'Briefly describe this part of the plot…',
    deleteScene: 'Delete this node',
    emptySelect: 'Select a plot node to view details',
    emptyEdit: 'Select a plot node to edit',
    clickCard: 'Click a card in the middle timeline to edit',
    selectLineFirst: 'Please select or create a plot line first'
  },
  timeEra: {
    bc: 'BC',
    zero: 'Year Zero',
    ad: 'AD'
  },
  timeYearUnit: ''
} satisfies ZhCNResources['plot']

export default plot
