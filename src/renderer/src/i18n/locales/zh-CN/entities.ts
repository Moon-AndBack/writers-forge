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
  notFound: '未找到该实体'
}

export default entities
