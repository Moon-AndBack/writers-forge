/**
 * 写作页命名空间（`writer`）：跨模块复用的**固定标签**——面板 aria、
 * 章节模块右栏页签与其下拉 / 只读正文 / 详情文案、状态栏 title。
 *
 * 取用约定：消费者 `useTranslation('writer')` 后以同 ns 点分路径取用
 * （如 `t('rightTabs.outline')`）。
 *
 * 判定说明（固定标签 vs 演示数据）：
 * - 译：章节模块右栏「大纲 / 剧情」双页签与其下拉 / 只读正文 / 详情文案
 *   （`rightTabs.*` / `rightOutline.*` / `rightPlot.*`）、面板 aria、状态栏 title。
 * - 不译（演示数据，见 `pages/writer/data.ts`）：素材 / 笔记演示条目、
 *   世界观中栏标签（含演示条目类型）、大纲「主线 · 寻找父亲」等具体条目名。
 */
const writer = {
  sidePaneAria: '侧栏',
  rightPaneAria: '右侧面板',
  rightTabs: {
    aria: '右栏页签',
    outline: '大纲',
    plot: '剧情',
    ai: 'AI',
    foreshadow: '伏笔'
  },
  rightOutline: {
    outlineLabel: '大纲',
    detailLabel: '细纲',
    entryOption: '独立条目 · {{name}}',
    volumeOption: '卷 · {{name}}',
    groupOption: '分组 · {{name}}',
    empty: '还没有任何大纲内容',
    entryEmpty: '该条目暂无正文',
    volumeEmpty: '该卷暂无卷纲',
    groupEmpty: '该分组暂无卷纲',
    noDetail: '该卷下暂无条目',
    groupNoDetail: '该分组下暂无条目'
  },
  rightPlot: {
    timelineFilterAria: '按时间线筛选剧情节点',
    timelineAll: '全部时间线',
    lineFilterAria: '按剧情线筛选剧情节点',
    lineAll: '全部剧情线',
    filterEmpty: '当前筛选下没有剧情节点',
    hoverEmpty: '该节点暂无正文',
    lineEmpty: '当前时间线还没有剧情线'
  },
  chapterPositionTitle: '当前章在全书普通章序列中的位置'
}

export default writer
