/** 通用文案命名空间（`common`）：跨组件复用的操作 / 状态词与组件默认文案。 */
const common = {
  cancel: '取消',
  confirm: '确定',
  close: '关闭',
  remove: '移除',
  clear: '清除',
  selectPlaceholder: '请选择',
  noOptions: '暂无选项',
  chipPlaceholder: '输入后回车添加',
  removeTag: '移除 {{tag}}',
  suggestionsLabel: '常用标签',
  stepperLabel: '数值',
  stepperDecrease: '{{label}}减少',
  stepperEdit: '编辑{{label}}',
  stepperIncrease: '{{label}}增加',
  save: '保存',
  saving: '保存中…',
  saveDirty: '保存（有未保存改动）',
  /** 保存失败（如设定档案草稿落库失败）：不切换模块，可重试。 */
  saveFailed: '保存失败，请重试',
  /**
   * 模块切换的未保存守卫（活动栏图标 / 筛选浮层的「搜索」发起）：
   * 两态确认；`module` / `target` 均为模块名（取 `module` ns）。
   */
  unsavedModuleSwitch: {
    title: '当前模块有未保存的修改',
    message:
      '「{{module}}」还有未保存的修改。点「保存并切换」先落库再切到「{{target}}」；点「放弃并切换」丢弃这些修改直接切过去。',
    saveAndSwitch: '保存并切换',
    discardAndSwitch: '放弃并切换'
  },
  undo: '撤销',
  redo: '重做',
  searchButton: '搜索',
  trashButton: '回收站',
  bold: '加粗',
  italic: '斜体',
  underline: '下划线',
  strike: '删除线',
  highlight: '高亮',
  clearFormat: '清除格式',
  /**
   * 编辑器块级 / 插入 / 表格格式（大纲页标题栏格式按钮组）。
   * 与上方 `bold`…`clearFormat`（行内 mark）分列：此处为块级节点与表格命令文案。
   */
  format: {
    headingGroup: '标题',
    paragraphGroup: '段落',
    paragraph: '正文',
    h1: 'H1',
    h2: 'H2',
    h3: 'H3',
    h4: 'H4',
    h5: 'H5',
    h6: 'H6',
    bulletList: '无序列表',
    orderedList: '有序列表',
    blockquote: '引用',
    codeBlock: '代码块',
    horizontalRule: '分隔线',
    inlineCode: '行内代码',
    tableGroup: '表格',
    insertTable: '插入表格',
    tableRows: '行数',
    tableCols: '列数',
    tableHeaderRow: '含表头行',
    link: '链接',
    linkUrl: '链接地址',
    linkPlaceholder: 'https://example.com',
    linkApply: '应用链接',
    linkRemove: '移除链接',
    colBefore: '左侧插入列',
    colAfter: '右侧插入列',
    colDelete: '删除列',
    rowBefore: '上方插入行',
    rowAfter: '下方插入行',
    rowDelete: '删除行',
    mergeCells: '合并单元格',
    splitCell: '拆分单元格',
    headerRow: '表头行',
    headerCol: '表头列',
    tableDelete: '删除表格',
    tableMenu: '表格',
    alignLeft: '左对齐',
    alignCenter: '居中对齐',
    alignRight: '右对齐',
    textColor: '文字颜色',
    highlightNone: '无高亮',
    colorRed: '红色',
    colorOrange: '橙色',
    colorAmber: '琥珀色',
    colorGreen: '绿色',
    colorTeal: '青色',
    colorBlue: '蓝色',
    colorIndigo: '靛蓝',
    colorPurple: '紫色',
    colorPink: '粉色',
    colorBrown: '棕色',
    /**
     * 正文内嵌图片（大纲「插入图片」入口）：双入口文案 + 位置约束原因 + 校验提示。
     * `reason*` 为 `format.image.<reason>` 的取值来源（与 imageNode.ts 的
     * `ImageBlockReason` 联合体逐字对应）。
     */
    image: {
      group: '插入图片',
      fileTitle: '本地图片',
      filePick: '选择文件…',
      urlTitle: '图片链接',
      urlAria: '图片链接地址',
      urlPlaceholder: 'https://example.com/picture.png',
      urlApply: '插入图片',
      invalidType: '仅支持 PNG / JPEG / WebP / GIF 图片',
      tooLarge: '图片过大（上限 20 MB）',
      uploadFailed: '图片保存失败，请重试',
      invalidUrl: '请输入 http:// 或 https:// 开头的图片链接',
      missingAlt: '图片无法显示',
      reasonTable: '表格内不能插入图片',
      reasonCodeBlock: '代码块内不能插入图片',
      reasonHeading: '标题内不能插入图片',
      reasonList: '列表内不能插入图片',
      reasonBlock: '当前位置不能插入图片',
      reasonNoBook: '未关联书籍，无法插入图片'
    }
  },
  /**
   * 编辑器正文右键「选区菜单」通用项（搜索选中文字 / 加入违禁词库）。
   * 九个违禁词类别名不在此处：复用 `chapters` ns 的 `cleanWords.category.*`（词库单一真源）。
   */
  selectionMenu: {
    title: '选中文字',
    search: '搜索选中文字',
    addWord: '加入违禁词库',
    categoryTitle: '选择违禁词类别',
    searchEmpty: '没有可搜索的文字',
    wordEmpty: '没有可加入词库的文字',
    wordTooShort: '选中的文字少于 2 个字，无法加入词库',
    wordTooLong: '选中的文字超过 {{max}} 个字，请缩短后再加入',
    wordMultiline: '选中的文字包含换行，请只选中同一段内的文字',
    wordAdded: '已加入违禁词库',
    wordUpdated: '词条已存在，已更新类别',
    wordExists: '词条已存在，无需重复添加',
    wordFailed: '加入违禁词库失败，请重试'
  },
  loading: '加载中…',
  /** 列表 / 面板读取失败：区分「真的是空数据」与「读取失败」（失败时可重试）。 */
  loadFailedTitle: '加载失败',
  loadFailedDesc: '内容没有读取出来，可能是暂时性错误。请点「重试」再试一次。',
  retry: '重试',
  loadMore: '加载更多',
  restoreDefaultWidth: '双击恢复默认宽度',
  restoreDefaultSplit: '拖动调整上下两栏高度，双击恢复默认比例',
  comingSoon: '即将推出'
}

export default common
