/**
 * 剧情命名空间（`plot`）：剧情线列表、剧情时间轴、右栏节点编辑器、节点弹窗与只读详情文案。
 *
 * 取用约定：消费者 `useTranslation('plot')` 后以同 ns 点分路径取用
 * （如 `t('timeline.addNode')`）；含插值文案经第二参数传入（如 `t('dialog.deleteLine.message', { name })`）。
 * 「重命名」复用 `chapters.rename`，不在此重复定义。
 *
 * 不译边界（二期）：剧情线 / 场景节点均为纯自定义名，无编号 / 相对时间。
 */
const plot = {
  newLine: '新建剧情线',
  rename: '重命名',
  emptyTitle: '还没有剧情线',
  emptyDesc: '点击下方「新建剧情线」开始搭建剧情',
  deleteLine: '删除剧情线',
  dialog: {
    deleteLine: {
      title: '删除剧情线',
      message: '确定删除「{{name}}」？该线下的场景节点会一并删除。',
      confirm: '删除'
    },
    deleteScene: {
      title: '删除节点',
      message: '确定删除该剧情节点？此操作不可撤销。',
      confirm: '删除'
    },
    unsavedSwitch: {
      title: '有未保存的改动',
      message: '当前节点的改动尚未保存。点「保存」先落库再继续，点「不保存」放弃这些改动直接继续。',
      discard: '不保存'
    }
  },
  unnamedLine: '未命名剧情线',
  createDialog: {
    title: '新建剧情线',
    timelineLabel: '所属时间线',
    nameLabel: '名称',
    namePlaceholder: '留空显示为「未命名剧情线」',
    typeLabel: '类型',
    colorLabel: '颜色'
  },
  editDialog: {
    title: '编辑剧情线'
  },
  nodeDialog: {
    createTitle: '新建剧情节点',
    editTitle: '编辑剧情节点'
  },
  lineTypes: {
    main: '主线',
    branch: '支线',
    romance: '感情',
    hidden: '暗线',
    sub: '副线',
    growth: '成长',
    world: '世界',
    suspense: '悬念'
  },
  lineColors: {
    purple: '紫罗兰',
    blue: '天青',
    green: '松林',
    orange: '琥珀',
    violet: '暮紫',
    teal: '湖绿',
    rose: '绯红',
    slate: '石板',
    pink: '樱粉',
    coral: '珊瑚',
    gold: '鎏金',
    lime: '荧绿',
    cyan: '晴空',
    indigo: '靛蓝',
    brown: '赭石',
    gray: '雾灰'
  },
  unnamedScene: '未命名节点',
  undatedScene: '时间未定',
  timeline: {
    addNode: '添加剧情节点',
    emptyLineTitle: '还没有选中剧情线',
    emptyLineDesc: '在左侧选择或新建一条剧情线，即可在此编排场景时间轴',
    emptyNodes: '这条剧情线还没有节点，点击上方 ＋ 添加',
    editTime: '设置时间',
    editTitle: '设置标题',
    moreCharacters: '+{{n}}',
    moreCharactersTitle: '还有 {{n}} 个出场实体'
  },
  editor: {
    fieldTime: '时间',
    fieldTimeEra: '纪元',
    fieldTimeYear: '年份',
    fieldTimeDesc: '时间描述',
    fieldTitle: '标题',
    fieldContent: '剧情内容',
    timePlaceholder: '例：第 4 天 · 正午',
    timeYearPlaceholder: '例：3',
    eraUnset: '未设置',
    titlePlaceholder: '剧情标题',
    contentPlaceholder: '简单描述这一段剧情…',
    deleteScene: '删除这个节点',
    emptySelect: '选择剧情节点查看详情',
    emptyEdit: '选择剧情节点开始编辑',
    clickCard: '点击中栏时间轴中的卡片进行编辑',
    selectLineFirst: '请先选择或新建一条剧情线'
  },
  timeEra: {
    bc: '纪前',
    zero: '元年',
    ad: '纪后'
  },
  timeYearUnit: '年'
}

export default plot
