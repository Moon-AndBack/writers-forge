/**
 * 书架命名空间（`bookshelf`）：书架页（工具栏 / 卡片 / 表单 / 删除确认 / 状态栏统计）文案。
 *
 * 取用约定：消费者 `useTranslation('bookshelf')` 后以同 ns 点分路径取用（如 `t('filter.all')`）；
 * 含插值文案经第二参数传入（如 `t('dialog.bookDeletedToast', { title })`）。
 * 状态栏统计（`status.bookCount/totalWords/todayWords/streak`）含 `<b>` 标记，配合 react-i18next
 * `Trans` 的 `components={{ b: <b /> }}` 渲染，以保留原有「数值加粗」的内联结构。
 *
 * 不译边界：分类名真源为 `categories.name`（中文原文，不进 i18n）；
 * `COVER_COLORS[].label` 为数据常量（与主进程 books.ts 镜像同步），保持中文原文；
 * `BOOK_STATUS_OPTIONS` / `STATUS_META` 的展示名复用本 ns 的 `status.*`。
 */
const bookshelf = {
  newBook: '新建书籍',
  defaultAuthor: '未署名',
  filter: {
    all: '全部',
    writing: '连载中',
    done: '已完结',
    draft: '草稿',
    paused: '暂停',
    dropped: '太监',
    revising: '修订中',
    aria: '按状态筛选书籍'
  },
  sort: {
    recent: '最近编辑',
    words: '字数最多',
    chapters: '章节最多',
    title: '书名',
    fallback: '排序',
    tooltip: '排序方式'
  },
  search: {
    aria: '搜索书名',
    placeholder: '搜索书名…'
  },
  status: {
    writing: '连载中',
    done: '已完结',
    draft: '草稿',
    paused: '暂停',
    dropped: '太监',
    revising: '修订中',
    bookCount: '<b>{{count}} 本书</b>',
    totalWords: '累计字数 <b>{{value}}</b>',
    todayWords: '今日写作 <b>{{value}}</b> 字',
    streak: '连续写作 <b>{{count}}</b> 天'
  },
  channel: {
    male: '男频',
    female: '女频',
    publish: '出版'
  },
  length: {
    long: '长篇',
    medium: '中篇',
    short: '短篇'
  },
  categoryTree: {
    loading: '分类加载中…',
    loadError: '分类加载失败',
    retry: '重试',
    parentAria: '主分类',
    childAria: '子分类',
    parentPlaceholder: '选择主分类',
    childPlaceholder: '选择子分类',
    childNoParent: '请先选择主分类',
    noChildren: '无子分类',
    add: '添加'
  },
  card: {
    ariaLabel: '{{title}}，{{status}}',
    editAria: '编辑《{{title}}》',
    deleteAria: '删除《{{title}}》',
    progressAria: '{{title}} 写作进度',
    chapterCount: '{{count}} 章'
  },
  form: {
    titleCreate: '新建书籍',
    titleEdit: '编辑书籍',
    submitCreate: '创建',
    submitEdit: '保存',
    title: '书名',
    titleRequired: '请输入书名',
    titlePlaceholder: '如：雾起南屿',
    intro: '简介',
    introPlaceholder: '一句话概括这本书的故事…',
    categories: '分类',
    categoriesHint: '从「主分类 / 子分类」下拉选好后点「添加」；未选频道时仅可选「我的分类」',
    categoriesAria: '分类（可多选）',
    unset: '未设置',
    status: '状态',
    statusAria: '写作状态',
    channel: '频道',
    channelHint: '可留空；切换频道会清空已选分类',
    channelAria: '频道',
    lengthType: '篇幅',
    lengthHint: '可留空',
    lengthAria: '篇幅',
    coverColor: '封面色',
    coverHint: '封面字自动取书名首字',
    coverColorAria: '封面色',
    coverPreviewAlt: '封面预览',
    coverCharFallback: '书',
    pickCover: '选择封面图',
    removeCover: '移除封面图'
  },
  dialog: {
    deleteBook: {
      title: '删除书籍',
      message: '确定删除《{{title}}》？该书的章节与正文将一并被永久删除，无法恢复。',
      confirm: '删除'
    },
    bookDeletedToast: '已删除《{{title}}》',
    bookCreateFailedToast: '创建《{{title}}》失败，请重试',
    bookUpdateFailedToast: '保存《{{title}}》失败，请重试',
    bookDeleteFailedToast: '删除《{{title}}》失败，请重试',
    bookCoverFailedToast: '封面保存失败，请重试',
    thisBookFallback: '这本书'
  },
  wordCount: {
    wan: '{{value}} 万',
    wanBook: '{{value}} 万字',
    chars: '{{value}} 字'
  }
}

export default bookshelf
