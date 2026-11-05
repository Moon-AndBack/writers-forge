/**
 * 伏笔命名空间（`foreshadow`）：伏笔模块的标题 / 空态 / 列表项、新建与编辑弹窗、
 * 正文右键「添加伏笔」提示、操作结果提示与锚点失效提示。
 *
 * 取用约定：消费者 `useTranslation('foreshadow')` 后以同 ns 点分路径取用
 * （如 `t('status.planted')`）；含插值文案经第二参数传入
 * （如 `t('dialog.delete.message', { title })`）。
 *
 * 状态键按**派生展示状态**（drafting / planted / recovered / abandoned，见
 * `src/shared/foreshadowStatus.ts`）登记；落库 `status` 仅是废弃标记，不再直接驱动文案。
 * 后续批次可在本文件按需补 key，不预造未用文案以外的结构。
 */
const foreshadow = {
  title: '伏笔',
  emptyTitle: '还没有伏笔',
  emptyDesc: '在正文中选中一段文字，右键选择「添加伏笔」',
  listItem: {
    anchored: '已锚定',
    unanchored: '未锚定',
    anchorInvalid: '锚点已失效',
    /** 相关实体行（无障碍名）与「+N」计数胶囊提示。 */
    relatedEntities: '相关实体',
    moreEntities: '还有 {{n}} 个相关实体'
  },
  /** 章节模块右栏「伏笔」页签（全书只读总览）：仅空态（分组不显示标题 / 条数）。 */
  overview: {
    empty: '全书还没有伏笔'
  },
  anchor: {
    invalid: '原文已改动，锚点已失效',
    missing: '找不到锚定的原文',
    chapter: '章节 · {{name}}',
    outline: '大纲 · {{name}}',
    unnamedTarget: '未命名条目'
  },
  status: {
    drafting: '建设中',
    planted: '埋设中',
    recovered: '已回收',
    abandoned: '已废弃'
  },
  mark: {
    heading: '伏笔：{{name}}',
    recoveredAt: '已回收于 {{place}}',
    recovered: '已回收',
    plantedPlace: '埋设于 {{place}}',
    pending: '待回收',
    abandoned: '已废弃',
    secondary: '大纲埋点 · {{status}}',
    unknownPlace: '未知位置'
  },
  field: {
    name: '名称',
    namePlaceholder: '给这条伏笔起个名字',
    nameRequired: '名称不能为空',
    untitled: '未命名伏笔',
    context: '关联',
    contextUnlinked: '未关联',
    selectedText: '选中文字',
    selectedTextEmpty: '未选中文字',
    description: '描述',
    descriptionPlaceholder: '补充埋设意图、回收方式等'
  },
  detail: {
    emptyTitle: '未选择伏笔',
    emptyDesc: '在列表中选择一条伏笔，查看并编辑详情',
    plant: '正文埋点',
    plant2: '大纲埋点',
    remove: '移除',
    plantEmpty: '未锚定',
    recover: '回收位置',
    recoverEmpty: '未回收',
    recoverNote: '回收备注',
    abandon: '废弃',
    restore: '恢复',
    abandonRecoveredHint: '已回收的伏笔不可废弃',
    removeRecoveredHint: '已回收的伏笔不可移除埋点，请先移除回收位置'
  },
  dialog: {
    createTitle: '新建伏笔',
    editTitle: '编辑伏笔',
    unsavedSwitch: {
      title: '有未保存的改动',
      message: '当前伏笔的改动尚未保存。点「保存」先落库再继续，点「不保存」放弃这些改动直接继续。',
      discard: '不保存'
    },
    delete: {
      title: '删除伏笔',
      message: '确定删除「{{title}}」？此操作不可撤销。',
      confirm: '删除'
    },
    removeAnchor2: {
      title: '移除大纲埋点',
      message: '确定移除这条伏笔的大纲埋点？该处的原文摘抄与位置快照会一并清除。',
      confirm: '移除'
    },
    removeBody: {
      title: '移除正文埋点',
      message: '确定移除这条伏笔的正文埋点？该处的原文摘抄与位置快照会一并清除。',
      confirm: '移除'
    },
    removeRecover: {
      title: '移除回收位置',
      message:
        '确定移除这条伏笔的回收位置？该处的原文摘抄与位置快照会一并清除，状态将按剩余锚点重新判定。',
      confirm: '移除'
    }
  },
  /**
   * 删除章节 / 大纲条目时的双埋点伏笔提示（追加在现有删除确认框正文后）：
   * `soft` = 软删（进回收站，伏笔保留但此处锚点失效）；`purge` = 彻底删除
   * （外键级联整条删除伏笔）；`separator` / `more` 用于多条目名称收口。
   */
  deleteImpact: {
    soft: '检测到双埋点伏笔：{{titles}}。删除后此处埋设点会失效，但伏笔本身与另一处埋设点仍会保留，可在「伏笔」模块中查看。',
    purge:
      '检测到双埋点伏笔：{{titles}}。彻底删除后，这些伏笔会连同另一处埋设点一起被永久删除，无法恢复。',
    separator: '、',
    more: '{{titles}} 等 {{count}} 条'
  },
  action: {
    save: '保存',
    cancel: '取消',
    delete: '删除'
  },
  toast: {
    createSuccess: '伏笔已创建',
    createFailed: '创建伏笔失败，请重试',
    updateSuccess: '伏笔已保存',
    updateFailed: '保存伏笔失败，请重试',
    clearAnchorFailed: '移除失败，请重试',
    recoverSuccess: '伏笔已回收',
    recoverFailed: '回收伏笔失败，请重试',
    abandonSuccess: '伏笔已废弃',
    restoreSuccess: '伏笔已恢复',
    deleteSuccess: '伏笔已删除',
    deleteFailed: '删除伏笔失败，请重试'
  },
  recover: {
    title: '回收伏笔',
    searchPlaceholder: '按名称搜索伏笔',
    listLabel: '可回收的伏笔',
    empty: '当前没有可回收的伏笔',
    noResult: '没有匹配的伏笔',
    loadFailed: '加载伏笔列表失败，请关闭后重试',
    noteLabel: '回收备注',
    notePlaceholder: '记录这条伏笔是如何回收的（可选）',
    submit: '回收'
  },
  attach: {
    title: '关联伏笔',
    searchPlaceholder: '按名称搜索伏笔',
    listLabel: '可关联的伏笔',
    empty: '没有可关联的伏笔',
    noResult: '没有匹配的伏笔',
    loadFailed: '加载伏笔列表失败，请关闭后重试',
    submit: '关联',
    success: '已关联埋点',
    full: '这条伏笔已有两个埋设点',
    failed: '关联失败，请重试'
  },
  contextMenu: {
    add: '添加伏笔',
    attach: '关联伏笔',
    recover: '回收伏笔',
    hint: '选中一段文字后右键，可将其设为伏笔锚点',
    noSelection: '请先选中一段文字'
  }
}

export default foreshadow
