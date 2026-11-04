/**
 * 伏笔命名空间（`foreshadow`）：伏笔模块的标题 / 空态 / 列表项、新建与编辑弹窗、
 * 正文右键「添加伏笔」提示、操作结果提示与锚点失效提示。
 *
 * 取用约定：消费者 `useTranslation('foreshadow')` 后以同 ns 点分路径取用
 * （如 `t('status.planted')`）；含插值文案经第二参数传入
 * （如 `t('dialog.delete.message', { title })`）。
 *
 * 状态枚举键与数据层 `ForeshadowStatus`（planted / recovered / abandoned）逐字一致；
 * 后续批次可在本文件按需补 key，不预造未用文案以外的结构。
 */
const foreshadow = {
  title: '伏笔',
  emptyTitle: '还没有伏笔',
  emptyDesc: '在正文中选中一段文字，右键选择「添加伏笔」',
  listItem: {
    anchored: '已锚定',
    unanchored: '未锚定',
    anchorInvalid: '锚点已失效'
  },
  anchor: {
    invalid: '原文已改动，锚点已失效',
    missing: '找不到锚定的原文',
    chapter: '章节 · {{name}}',
    outline: '大纲 · {{name}}',
    unnamedTarget: '未命名条目'
  },
  status: {
    planted: '埋设中',
    recovered: '已回收',
    abandoned: '已废弃'
  },
  mark: {
    recoveredAt: '已回收于 {{place}}',
    recovered: '已回收',
    plantedAt: '埋设于 {{place}} · {{title}}',
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
    descriptionPlaceholder: '补充埋设意图、回收方式等',
    status: '状态'
  },
  detail: {
    emptyTitle: '未选择伏笔',
    emptyDesc: '在列表中选择一条伏笔，查看并编辑详情',
    plant: '埋点位置',
    plantEmpty: '未锚定',
    recover: '回收位置',
    recoverEmpty: '未回收',
    recoverNote: '回收备注'
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
    }
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
    recoverSuccess: '伏笔已回收',
    recoverFailed: '回收伏笔失败，请重试',
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
  contextMenu: {
    add: '添加伏笔',
    recover: '回收伏笔',
    hint: '选中一段文字后右键，可将其设为伏笔锚点',
    noSelection: '请先选中一段文字'
  }
}

export default foreshadow
