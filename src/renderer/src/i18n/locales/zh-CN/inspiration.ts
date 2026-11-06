/**
 * 灵感命名空间（`inspiration`）：灵感模块的列表空态、标签筛选、右栏字段、
 * 删除确认、未保存切换确认与操作结果提示。
 *
 * 取用约定：消费者 `useTranslation('inspiration')` 后以同 ns 点分路径取用
 * （如 `t('filter.all')`）；含插值文案经第二参数传入
 * （如 `t('dialog.delete.message', { title })`）。
 */
const inspiration = {
  emptyTitle: '还没有灵感',
  emptyDesc: '点标题栏「+」新建一条灵感，随手记下片段与想法',
  emptyFilteredTitle: '当前筛选下还没有灵感',
  emptyFilteredDesc: '在活动栏筛选浮窗切换标签，或清空搜索关键词',
  filter: {
    all: '全部',
    tagAria: '按标签筛选',
    searchPlaceholder: '搜索标题、内容或标签',
    searchAria: '搜索标题、内容或标签',
    search: '搜索'
  },
  field: {
    untitled: '未命名灵感',
    title: '标题',
    titlePlaceholder: '给这条灵感起个名字',
    content: '内容',
    contentPlaceholder: '随手记下片段、念头或一句话',
    contentEmpty: '暂无内容',
    tags: '标签',
    tagsPlaceholder: '输入标签后按回车',
    tagsHint: '最多 {{max}} 个标签，回车或逗号添加'
  },
  detail: {
    emptyTitle: '未选择灵感',
    emptyDesc: '在列表中选择一条灵感，查看并编辑详情',
    back: '返回灵感列表'
  },
  /** 章节模块右栏「灵感」页签：全书灵感只读总览。 */
  overview: {
    empty: '全书还没有灵感'
  },
  action: {
    create: '新建灵感',
    delete: '删除'
  },
  dialog: {
    delete: {
      title: '删除灵感',
      message: '确定删除「{{title}}」？将移入回收站，可再还原。',
      confirm: '删除'
    },
    unsavedSwitch: {
      title: '有未保存的改动',
      message: '当前灵感的改动尚未保存。点「保存」先落库再继续，点「不保存」放弃这些改动直接继续。',
      discard: '不保存'
    }
  },
  /** 中栏回收站（标题栏垃圾桶按钮切换；条目 / 清空文案在本 ns，计数与空态复用 chapters）。 */
  trash: {
    title: '灵感回收站',
    groupItems: '灵感',
    restoreItem: '还原灵感',
    purgeItem: '彻底删除灵感',
    dialog: {
      purge: {
        title: '彻底删除灵感',
        message: '「{{name}}」将被永久删除且无法恢复。',
        confirm: '彻底删除'
      },
      purgeAll: {
        title: '清空灵感回收站',
        message: '回收站中的全部灵感将被永久删除且无法恢复。',
        confirm: '清空'
      }
    }
  },
  toast: {
    createSuccess: '灵感已创建',
    createFailed: '创建灵感失败，请重试',
    saveSuccess: '灵感已保存',
    saveFailed: '保存灵感失败，请重试',
    deleteSuccess: '灵感已删除',
    deleteFailed: '删除灵感失败，请重试'
  }
}

export default inspiration
