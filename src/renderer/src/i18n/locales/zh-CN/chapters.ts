/**
 * 章节模块命名空间（`chapters`）：章状态、标题栏按钮、卷 / 章行、搜索替换、
 * 回收站、两个弹窗、违禁词库、编辑头、中栏元信息与确认框文案。
 *
 * 取用约定：消费者 `useTranslation('chapters')` 后以同 ns 点分路径取用
 * （如 `t('status.draft')`）；含插值文案经第二参数传入（如 `t('search.count', { total })`）。
 * `editor.footCount` 含 `<b>` 标记，配合 react-i18next `Trans` 的
 * `components={{ b: <b /> }}` 渲染，以保留「数值加粗」的内联结构（同 bookshelf.status.*）。
 *
 * 跨 ns 复用：标题栏「保存 / 撤销 / 重做 / 搜索 / 回收站」按钮文案已上移至 `common`
 * （`save` / `undo` / `redo` / `searchButton` / `trashButton`），章节与大纲模块共享。
 *
 * 编号文案：卷 / 章编号已按界面语言渲染——数字词（中 / 英）在
 * `chapterTree.ts` / `numberWords.ts` 生成，模板经 `numbering.*` 提供（`{{n}}` /
 * `{{index}}` / `{{total}}` 为数字词字符串）。相对时间（`刚刚 / N 分钟前 / …`，
 * `formatRelativeTime`）仍为中文（二期边界）。
 */
const chapters = {
  status: {
    draft: '草稿',
    done: '定稿'
  },
  numbering: {
    chapterPrefix: '第{{n}}章',
    volumePrefix: '卷{{n}}',
    statusPosition: '第{{index}}章 共{{total}}章',
    statusTotal: '共{{total}}章'
  },
  statusToggleAria: '章节状态：{{label}}（点击切换）',
  newVolume: '新建卷',
  newVolumeTooltip: '新建卷（正文卷 / 自定义卷）',
  pinTop: '置顶',
  pinBottom: '置底',
  deleteChapter: '删除章节',
  dragWithinSegment: '拖拽排序（同段内）',
  rename: '重命名',
  namePlaceholder: '请编辑',
  volumeFull: '已达卷内最大容量',
  newChapter: '新建章',
  newSpecialChapter: '新建特殊章',
  deleteVolume: '删除卷',
  specialVolumeNameAria: '特殊卷名',
  customVolumeNameAria: '卷自定义名',
  emptyTitle: '还没有创建卷',
  emptyDesc: '在顶部标题栏点击「新建卷」创建',
  editor: {
    lastEdited: '最后编辑 {{time}}',
    copyAll: '复制全文（纯文本，不含标题）',
    copyAllButton: '复制全文',
    copyDone: '已复制全文',
    copyFailed: '复制失败，请重试',
    copyEmpty: '正文为空，没有可复制的内容',
    footCount: '本章共 <b>{{count}}</b> / <b>{{limit}}</b> 字',
    wordLimitNear: '接近单篇字数上限',
    wordLimitReached: '已达单篇字数上限'
  },
  proofread: {
    hits: '{{count}} 处违禁词',
    hitsTitle: '正文中命中违禁词的处数（仅提示，不阻断写作）'
  },
  cleanWords: {
    button: '违禁词库',
    buttonTooltip: '违禁词库（内置 / 我的词条）',
    dialogTitle: '违禁词库',
    toggleFailed: '启用状态保存失败',
    deleteFailed: '删除失败',
    deleteConfirmTitle: '删除词条',
    deleteConfirmMessage: '确定删除「{{word}}」吗？删除后不可恢复。',
    deleteDone: '已删除「{{word}}」',
    sourceAria: '按来源筛选',
    sourceAll: '全部',
    sourceBuiltin: '内置',
    sourceUser: '我的',
    categoryAria: '按类别筛选',
    categoryAll: '全部类别',
    category: {
      political: '政治',
      sexual: '色情',
      violence: '暴力',
      ads: '广告',
      profanity: '辱骂',
      other: '其他'
    },
    hoverCategory: '类型：{{category}}',
    searchAria: '搜索词条',
    searchPlaceholder: '搜索词条',
    countSummary: '显示 {{shown}} / {{total}} 条 · 内置 {{builtin}} · 我的 {{user}}',
    addCategoryAria: '新词条类别',
    addWordAria: '新词条内容',
    addWordPlaceholder: '输入要添加的词条',
    addConfirm: '添加',
    addDone: '已添加「{{word}}」',
    addUpdated: '词条已存在，已更新类别',
    addExists: '词条「{{word}}」已存在，无需重复添加',
    addFailed: '添加失败，请重试',
    addWordTooShort: '词条至少需要 2 个字符',
    addWordTooLong: '词条最多 {{max}} 个字符',
    addWordMultiline: '词条不能包含换行',
    loading: '正在加载词表…',
    loadFailed: '词表加载失败',
    empty: '没有符合条件的词条',
    emptyFilterDesc: '试试放宽来源、类别或关键词筛选',
    emptyNoWords: '还没有词条',
    emptyNoWordsDesc: '可通过下方「添加」按钮新增自定义词条',
    showMore: '显示更多（剩余 {{rest}} 条）',
    toggleAria: '启用或禁用「{{word}}」',
    delete: '删除',
    deleteAria: '删除「{{word}}」',
    statusBarAria: '违禁词：{{hits}} 处（点击查看本章命中清单）',
    hitListTitle: '本章命中 {{total}} 处，涉及 {{words}} 个词',
    hitTimes: '{{count}} 次',
    openLibrary: '打开违禁词库',
    metaLine: '来源：{{source}}（{{license}}）· 拉取于 {{date}}'
  },
  search: {
    aria: '章节搜索与替换',
    title: '查找与替换',
    close: '关闭搜索',
    rangeAria: '搜索范围',
    searching: '搜索中…',
    count: '{{total}} 处',
    empty: '没有匹配项',
    placeholderSearch: '搜索',
    ariaSearch: '搜索内容',
    placeholderReplace: '替换为',
    ariaReplace: '替换内容',
    replace: '替换',
    replaceAll: '替换全部',
    replaceHere: '替换此处',
    scopeChapter: '本章',
    scopeBook: '全书',
    truncated:
      '结果过多，列表仅展示前面部分（共 {{total}} 处）；「替换全部」仍会处理范围内全部匹配。',
    errorSearch: '搜索失败',
    staleHit: '该处已变更，请重新搜索',
    errorReplace: '替换失败',
    errorReplaceAll: '替换全部失败'
  },
  trash: {
    title: '回收站',
    count: '{{total}} 项',
    purgeAll: '清空回收站',
    empty: '回收站为空',
    groupVolumes: '卷',
    groupChapters: '章节',
    orphanVolume: '原卷已删除',
    restoreVolume: '还原卷',
    purgeVolume: '彻底删除卷',
    restoreChapter: '还原章节',
    purgeChapter: '彻底删除章节'
  },
  newVolumeDialog: {
    title: '新建卷',
    typeAria: '卷类型',
    normal: '正文卷',
    custom: '自定义卷',
    customNameLabel: '自定义卷名',
    customNamePlaceholder: '如：风起卷（可空）',
    nameLabel: '卷名',
    namePlaceholder: '如：番外 / 作品相关'
  },
  specialChapterDialog: {
    title: '新建特殊章',
    prefixLabel: '前段',
    prefixPlaceholder: '如：序章',
    prefixRequired: '请填写前段（如「序章」「番外」）',
    nameLabel: '章节名',
    namePlaceholder: '如：潮声',
    nameRequired: '请填写章节名',
    positionLabel: '位置',
    positionAria: '位置',
    pinTop: '置顶',
    pinBottom: '置底'
  },
  titleRow: {
    specialPrefixAria: '特殊章前段（只读）',
    specialNameAria: '特殊章节名',
    titleAria: '章节标题'
  },
  dialog: {
    deleteVolume: {
      title: '删除卷',
      message: '确定删除「{{name}}」？该卷及其下的章节会一并移入回收站，可再还原。',
      confirm: '删除'
    },
    deleteChapter: {
      title: '删除章节',
      message: '确定删除「{{name}}」？将移入回收站，可再还原。',
      confirm: '删除'
    },
    purgeVolume: {
      title: '彻底删除卷',
      message: '「{{name}}」及其下章节将被永久删除且无法恢复。',
      confirm: '彻底删除'
    },
    purgeChapter: {
      title: '彻底删除章节',
      message: '「{{name}}」将被永久删除且无法恢复。',
      confirm: '彻底删除'
    },
    purgeAll: {
      title: '清空回收站',
      message: '回收站中的全部卷与章节将被永久删除且无法恢复。',
      confirm: '清空'
    }
  }
}

export default chapters
