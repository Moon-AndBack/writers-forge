/**
 * 大纲命名空间（`outline`）：大纲条目中栏编辑器、左栏卷章树与查找替换浮窗文案。
 *
 * 取用约定：消费者 `useTranslation('outline')` 后以同 ns 点分路径取用
 * （如 `t('search.title')`）；含插值文案经第二参数传入（如 `t('dialog.deleteVolume.message', { name })`）。
 * `footCount` 含 `<b>` 标记，配合 react-i18next `Trans` 的 `components={{ b: <b /> }}` 渲染。
 *
 * 跨 ns 复用（不在此重复定义）：
 * - 标题栏按钮组：添加 / 保存 / 撤销 / 重做 / 搜索 / 回收站复用 `outline.*` 与 `common.*`；
 * - 回收站视图：整体复用 `chapters.trash.*` 与 `chapters.dialog.purge*`（与章节回收站语义一致）。
 *
 * 不译边界（二期）：大纲卷 / 章均为纯自定义名（无「卷X」/「第X章」编号），不涉及中文数字。
 */
const outline = {
  emptyTitle: '还没有创建卷',
  emptyDesc: '点击标题栏「添加」开始搭建大纲',
  add: '添加',
  newVolume: '新建卷',
  volumeNameAria: '卷名',
  titleAria: '大纲题名',
  expandVolumeAria: '展开 / 折叠卷',
  dragWithinVolume: '拖拽排序（同卷内）',
  newChapter: '新建章',
  newNonVolumeChapter: '新建条目',
  newGroup: '新建分组',
  newChapterInGroup: '在分组下新建条目',
  rename: '重命名',
  deleteVolume: '删除卷',
  deleteChapter: '删除章',
  deleteGroup: '删除分组',
  footCount: '本条目共 <b>{{count}}</b> / <b>{{limit}}</b> 字',
  emptySelect: '选择左侧大纲条目开始编辑',
  emptySelectHint: '在大纲树中点击任意条目，即可在此撰写其正文',
  unnamedVolume: '未命名卷',
  unnamedChapter: '未命名章',
  unnamedGroup: '未命名分组',
  groupNameAria: '分组名',
  createDialog: {
    typeAria: '新建类型',
    nameLabel: '名称',
    namePlaceholder: '如：主线规划 / 风起卷（可空）'
  },
  dialog: {
    deleteVolume: {
      title: '删除卷',
      message:
        '确定删除「{{name}}」？该卷及其下的条目将移入大纲回收站；正文中的对应卷及其下的章节也会一并移入章节回收站，均可再还原。',
      messageWithImpact:
        '确定删除「{{name}}」？该卷及其下 {{outlineItems}} 个条目将移入大纲回收站；正文中的对应卷及其 {{chapters}} 个章节也会一并移入章节回收站，均可再还原。',
      confirm: '删除'
    },
    deleteChapter: {
      title: '删除章',
      message: '确定删除「{{name}}」？',
      confirm: '删除'
    },
    deleteGroup: {
      title: '删除分组',
      message: '确定删除「{{name}}」？该分组及其下的条目将移入大纲回收站，可再还原。',
      messageWithImpact:
        '确定删除「{{name}}」？该分组及其下 {{outlineItems}} 个条目将移入大纲回收站，可再还原。',
      confirm: '删除'
    }
  },
  search: {
    aria: '查找与替换（当前条目）',
    title: '查找与替换',
    close: '关闭搜索',
    placeholderSearch: '搜索（仅当前条目）',
    ariaSearch: '搜索内容',
    placeholderReplace: '替换为',
    ariaReplace: '替换内容',
    prev: '上一个',
    next: '下一个',
    replace: '替换',
    replaceAll: '替换全部',
    none: '无匹配',
    count: '命中 {{index}}/{{total}}',
    noMatch: '没有匹配项'
  },
  trash: {
    groupStandalone: '单大纲',
    groupGrouped: '分组大纲'
  }
}

export default outline
