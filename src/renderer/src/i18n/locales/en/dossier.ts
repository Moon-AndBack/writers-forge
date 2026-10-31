/**
 * 机翻占位 · 待校
 * 设定档案命名空间（`dossier`）英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * key 须与 zh-CN 的 dossier.ts 全等：由本文件 `satisfies ZhCNResources['dossier']` 与 en/index.ts 的聚合 `satisfies` 双重约束，缺 key / 多 key 会在 typecheck 报错。
 */
import type { ZhCNResources } from '../zh-CN'

const dossier = {
  gridAria: '{{module}} cards',
  countLabel: '{{total}} in total',
  unnamed: 'Untitled',
  subTypeUncategorized: 'Uncategorized',
  subTypeRequired: 'Please select a category',
  emptyTitle: 'No {{module}} yet',
  emptyDesc: 'Click the plus at the top-left of the title bar to create the first one',
  createAction: 'New {{module}}',
  createDialog: {
    title: 'New {{module}}',
    nameLabel: 'Name',
    namePlaceholder: 'Enter a name',
    subTypeLabel: 'Subtype',
    subTypePlaceholder: 'Select or add a subtype',
    addSubType: 'Add category',
    addSubTypePlaceholder: 'Enter a new category name',
    deleteSubType: 'Delete category',
    deleteSubTypeTitle: 'Delete category',
    deleteSubTypeMessage:
      'Delete custom category “{{name}}”? The {{count}} entries under it will be removed.',
    deleteSubTypeDisabled: 'Default categories cannot be deleted'
  },
  cardEmptyDesc: 'No summary',
  editAction: 'Edit',
  relationsAction: 'Relations',
  editDialog: {
    title: 'Edit {{module}}',
    nameLabel: 'Name',
    namePlaceholder: 'Enter a name',
    subTypeLabel: 'Category',
    aliasesLabel: 'Aliases',
    aliasesPlaceholder: 'Enter an alias',
    addAlias: 'Add alias'
  },
  relationsDialog: {
    title: 'Relations'
  },
  view: {
    uncategorized: 'Uncategorized'
  },
  dialog: {
    unsavedSwitch: {
      title: 'Unsaved changes',
      message:
        'This entry has unsaved changes. Choose “Save” to persist them first, or “Discard” to continue without them.',
      discard: 'Discard'
    }
  },
  detail: {
    emptyTitle: 'No {{module}} selected',
    emptyDesc: 'Pick a card on the left to view its details',
    emptyValue: 'None',
    noSubtypeFields: 'No subtype-specific fields to fill in',
    nameLabel: 'Name',
    namePlaceholder: 'Enter a name',
    subTypeLabel: 'Subtype',
    subTypePlaceholder: 'Select or add a subtype',
    gradeLabel: 'Grade',
    gradePlaceholder: 'e.g. superior',
    rankLabel: 'Rank',
    rankPlaceholder: 'e.g. 3',
    powerKindLabel: 'System type',
    powerKindPlaceholder: 'e.g. linear / multi-path / fruition',
    aliasesLabel: 'Aliases',
    aliasesPlaceholder: 'Enter an alias',
    addAlias: 'Add alias',
    bodyLabel: 'Body',
    bodyPlaceholder: 'Write the full entry…',
    tagsLabel: 'Tags',
    tagsPlaceholder: 'Press Enter or comma to add a tag',
    relationsEmpty: 'No relations yet',
    addRelation: 'Add relation',
    relation: {
      moduleLabel: 'Module',
      modulePlaceholder: 'Select a module',
      categoryLabel: 'Category',
      categoryPlaceholder: 'Select a category',
      categoryAll: 'All',
      targetLabel: 'Entry',
      targetSearchPlaceholder: 'Type a name to search entries',
      typeLabel: 'Relation type',
      typePlaceholder: 'Select a relation type',
      reverseHint: 'Saved as: item belongs to character',
      custom: 'Custom relation',
      noteLabel: 'Remark',
      notePlaceholder: 'Remark (optional)',
      edit: 'Edit relation',
      collapse: 'Collapse editor',
      incomingTitle: 'Referenced by',
      incomingEmpty: 'No incoming relations',
      incomingHint:
        'These relations are created by the other entry: you can change the type or remark, or remove them; the linked entry is read-only.',
      incomingTypeHint:
        'The type is recorded as “other → me”: “上级” means the other entry is my superior, “属于” means the other entry belongs to me.',
      removeMessage: 'Remove the relation with “{{name}}”? This cannot be undone.',
      removePill: 'Remove the relation with “{{name}}”'
    },
    removeRelation: 'Remove relation',
    delete: 'Delete',
    deleteTitle: 'Delete {{module}}',
    deleteMessage:
      'Delete “{{name}}”? Its aliases, tags and relations will be removed as well. This cannot be undone.',
    worldviewFields: {
      era: 'Era / Epoch',
      scale: 'Scale',
      population: 'Population',
      epoch: 'Epoch Name',
      coordinates: 'Coordinates',
      climate: 'Climate',
      area: 'Area',
      terrain: 'Terrain',
      language: 'Language',
      customs: 'Customs',
      religion: 'Religion',
      art: 'Art',
      lifespan: 'Lifespan',
      body_size: 'Body Size',
      reproduction: 'Reproduction',
      habits: 'Habits',
      currency: 'Currency',
      tax_rate: 'Tax Rate',
      trade_routes: 'Trade Routes',
      resources: 'Resources',
      physics: 'Physics Laws',
      magic: 'Magic Laws',
      taboo: 'Taboo',
      boundary: 'Boundary'
    },
    itemFields: {
      attack: 'Attack',
      durability: 'Durability',
      weight: 'Weight',
      material: 'Material',
      tier: 'Tier',
      practice: 'Cultivation Method',
      cost: 'Cost',
      requirement: 'Cultivation Requirement',
      effect: 'Effect',
      side_effect: 'Side Effect',
      difficulty: 'Crafting Difficulty',
      shelf_life: 'Shelf Life',
      talent_type: 'Talent Type',
      awaken_condition: 'Awakening Condition',
      growth: 'Growth',
      limitation: 'Limitation',
      defense: 'Defense',
      slot: 'Slot',
      set_bonus: 'Set Bonus',
      usage: 'Usage',
      grade_label: 'Grade',
      origin: 'Origin',
      reserve: 'Reserve'
    },
    factionFields: {
      gate: 'Mountain Gate',
      disciples: 'Disciples',
      heritage: 'Technique Heritage',
      precepts: 'Precepts',
      patriarch: 'Patriarch',
      family_rules: 'Family Rules',
      bloodline: 'Bloodline',
      ancestral_teaching: 'Ancestral Teachings',
      territory: 'Territory',
      law: 'Laws',
      army: 'Army',
      capital: 'Capital',
      business: 'Business Scope',
      funds: 'Funds',
      branches: 'Branches',
      reputation: 'Reputation',
      form: 'Organization Form',
      members: 'Members',
      goal: 'Goal',
      freedom: 'Freedom',
      doctrine: 'Doctrine',
      ritual: 'Rituals',
      taboo: 'Taboo',
      sphere: 'Sphere of Influence'
    },
    customFields: {
      title: 'Custom fields',
      empty: 'No custom fields yet — use the button below to add one',
      hint: 'Up to 64 entries; key ≤64 chars, value ≤2000 chars; use “Save” at the bottom of the right pane',
      key: 'Field name',
      keyPlaceholder: 'e.g. grade',
      value: 'Field value',
      valuePlaceholder: 'e.g. superior',
      add: 'Add field',
      remove: 'Remove field'
    }
  }
} satisfies ZhCNResources['dossier']

export default dossier
