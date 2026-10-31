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
    originLabel: '起点',
    originPlaceholder: '例：元年'
  },
  originLabel: '起点',
  originTitle: '起点',
  originDefault: '元年',
  originDesc: '主时间线只读线的起点时间，默认「元年」；可在右栏修改。',
  originNote: '故事开始了',
  readonlyNote: '只读 · 不参与剧情线计数与排序',
  originAria: '时间线起点',
  originPlaceholder: '例：元年',
  originSave: '保存起点',
  originSaved: '已保存',
  originEmpty: '未设置起点时显示「元年」',
  timelineSelect: {
    label: '时间线',
    placeholder: '选择时间线'
  },
  plotEmpty: '暂无剧情节点',
  /* 状态栏「卡片尺寸」控件（4 档；数值档展示名直接取字面值，仅「不限制」可译）。 */
  cardSize: {
    minWidth: '最小宽度',
    maxWidth: '最大宽度',
    minHeight: '最小高度',
    maxHeight: '最大高度',
    none: '不限制',
    pill: {
      minWidth: '宽 ≥ {{value}}',
      maxWidth: '宽 ≤ {{value}}',
      minHeight: '高 ≥ {{value}}',
      maxHeight: '高 ≤ {{value}}'
    }
  }
}

export default timeline
