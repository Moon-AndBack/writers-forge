/**
 * 独立时间线命名空间（`timeline`）：主时间线只读线与起点说明文案。
 * key 为真源；en 须保持全等（`satisfies ZhCNResources` 约束）。
 */
const timeline = {
  title: '主时间线',
  defaultName: '主时间线',
  emptyTitle: '暂无时间线',
  emptyDesc: '点击标题栏「添加时间线」新建',
  newTimeline: '添加时间线',
  newDialog: {
    title: '新建时间线',
    nameLabel: '名称',
    namePlaceholder: '例：主时间线',
    descLabel: '起点描述',
    descPlaceholder: '例：故事从这里开始'
  },
  originTitle: '起点',
  originRename: '重命名起点',
  originDefault: '元年',
  originDesc:
    '起点时间固定为「元年」，不可修改；此处填写当前时间线的起点描述，改完点下方「保存」落库。',
  originNote: '故事开始了',
  readonlyNote: '只读 · 不参与剧情线计数与排序',
  originDescLabel: '起点描述',
  originPlaceholder: '例：故事从这里开始',
  rename: '重命名',
  delete: '删除',
  deleteLastDisabled: '至少保留一条时间线',
  deleteBlocked: '该时间线下还有 {{count}} 条剧情线，请先删除或迁移',
  renameFailed: '重命名失败，请重试',
  deleteFailed: '删除失败，请重试',
  dialog: {
    delete: {
      title: '删除时间线',
      message: '确定删除时间线「{{name}}」吗？此操作不可撤销。',
      confirm: '删除'
    }
  },
  timelineSelect: {
    label: '时间线',
    placeholder: '选择时间线'
  },
  plotEmpty: '暂无剧情节点',
  sceneBodyEmpty: '该节点暂无正文'
}

export default timeline
