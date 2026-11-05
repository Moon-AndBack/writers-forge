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
  emptyFilteredTitle: '该标签下还没有灵感',
  emptyFilteredDesc: '切换到「全部」，或为灵感添加这个标签',
  filter: {
    label: '标签筛选',
    all: '全部',
    empty: '暂无可用标签',
    resultCount: '共 {{n}} 条'
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
    delete: '删除'
  },
  action: {
    create: '新建灵感',
    delete: '删除'
  },
  dialog: {
    delete: {
      title: '删除灵感',
      message: '确定删除「{{title}}」？此操作不可撤销。',
      confirm: '删除'
    },
    unsavedSwitch: {
      title: '有未保存的改动',
      message: '当前灵感的改动尚未保存。点「保存」先落库再继续，点「不保存」放弃这些改动直接继续。',
      discard: '不保存'
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
