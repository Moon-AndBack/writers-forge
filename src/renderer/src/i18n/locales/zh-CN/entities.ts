/**
 * 实体命名空间（`entities`）：实体悬停弹窗（`HoverCard`）的类型标签与字段名。
 *
 * 取用约定：消费者 `useTranslation('entities')` 后以同 ns 点分路径取用
 * （如 `t('type.character')`）。「加载中…」复用 `common.loading`，不在此重复定义。
 * 实体类型枚举键（worldview / character / item / faction / power_system）与统一设定库一致。
 */
const entities = {
  type: {
    worldview: '世界观',
    character: '人物',
    item: '物品',
    faction: '势力',
    power_system: '境界体系'
  },
  aliases: '别名',
  tags: '标签',
  relations: '关联',
  /** 悬停卡「首次登场」位置行（仅匹配章节正文）。 */
  firstAppearance: '首次登场',
  /** 实体尚未在章节正文中出现（弱化色）。 */
  firstAppearanceNone: '尚未登场',
  notFound: '未找到该实体',
  /** 章节 / 大纲右栏「实体」页签（只读总览）。 */
  overview: {
    empty: '这本书还没有任何设定条目'
  },
  /** 右栏「实体」页签的筛选卡（模块下拉 + 子类下拉 + 搜索）。 */
  filter: {
    searchPlaceholder: '搜索名称、别名或类别',
    searchAria: '搜索实体',
    moduleAll: '全部模块',
    moduleAria: '按模块筛选',
    subtypeAll: '全部子类',
    subtypeAria: '按子类筛选',
    noMatch: '没有匹配的实体'
  },
  /** 右栏「实体」页签的只读详情（列表 → 详情两级视图的第二级）。 */
  detail: {
    back: '返回',
    category: '类别',
    bodyEmpty: '暂无正文'
  }
}

export default entities
