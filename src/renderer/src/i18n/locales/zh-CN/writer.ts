/**
 * 写作页命名空间（`writer`）：跨模块复用的**固定标签**——左栏标题（`side.*`）、
 * 右栏面板标题（`right.*`）与写作页固定 UI 文案（面板 aria、右栏分区标题、状态栏 title）。
 *
 * 取用约定：消费者 `useTranslation('writer')` 后以同 ns 点分路径取用
 * （如 `t('side.outline')`）。键即 `WriterModule`（`chapters` / `outline` / `plot` / …），
 * 与 `module` 命名空间的键一致（`module.*` 为模块名，本 ns 为「左栏 / 右栏」语境标题）。
 *
 * 判定说明（固定标签 vs 演示数据）：
 * - 译：`side.*` / `right.*`（面板语境标题）、章节模块右栏「大纲 / 剧情」双页签与其
 *   下拉 / 只读正文 / 详情文案（`rightTabs.*` / `rightOutline.*` / `rightPlot.*`）、
 *   面板 aria、状态栏 title。
 * - 不译（演示数据，见 `pages/writer/data.ts`）：素材 / 笔记演示条目、
 *   世界观中栏标签（含演示条目类型）、大纲「主线 · 寻找父亲」等具体条目名。
 */
const writer = {
  side: {
    chapters: '章节',
    outline: '大纲线',
    plot: '剧情',
    worldview: '设定条目',
    characters: '角色',
    factions: '势力',
    power_system: '境界体系',
    items: '物品功法',
    timeline: '时间线',
    foreshadow: '伏笔',
    inspiration: '灵感'
  },
  right: {
    worldview: '设定关联',
    characters: '角色信息',
    factions: '势力信息',
    power_system: '境界体系信息',
    items: '物品功法信息',
    timeline: '时间线',
    foreshadow: '伏笔信息',
    inspiration: '灵感信息'
  },
  sidePaneAria: '侧栏',
  rightPaneAria: '右侧面板',
  worldTitleAria: '设定标题',
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
