/**
 * 设置页文案命名空间（`settings`）：各设置分组（基础偏好 / 外观与主题 /
 * 自定义分类 / 数据与备份）文案。消费者统一 `useTranslation('settings')`
 * 后以同 ns 点分路径取用（如 `t('general.title')`）。
 *
 * 命名说明：主题模式组用 `themeMode`（而非 `theme`）以免与独立 `theme` ns 混淆——
 * 主题档位展示名仍由 `theme` ns 提供（见 themes.ts 的 labelKey）。
 */
const settings = {
  general: {
    title: '基础偏好',
    description: '软件的通用行为与启动偏好'
  },
  locale: {
    label: '界面语言',
    description: '选择软件的显示语言',
    zhCN: '简体中文',
    en: 'English'
  },
  autoSave: {
    label: '自动保存',
    description: '编辑正文后自动保存；关闭后需手动保存（切换章节或关闭窗口时仍会保存）'
  },
  defaultView: {
    label: '默认打开视图',
    description: '启动软件时默认显示的页面',
    bookshelf: '书架',
    chapter: '章节编辑',
    outline: '大纲视图'
  },
  appearance: {
    title: '外观与主题',
    description: '主题模式'
  },
  themeMode: {
    label: '主题模式',
    description: '跟随系统或指定明暗 / 预设主题'
  },
  data: {
    title: '数据与备份',
    description: '本地数据位置与数据导出',
    location: {
      label: '本地数据存储位置',
      description: '当前文件保存在本地磁盘中',
      action: '打开文件夹'
    },
    export: {
      label: '导出全部数据',
      description: '将所有文稿导出为 Markdown 格式',
      action: '导出数据'
    }
  },
  categories: {
    title: '自定义分类',
    description: '创建你自己的分类，供所有书籍选用；与「男频 / 女频 / 出版」官方分类相互独立',
    placeholder: '输入新分类名称',
    add: '添加',
    empty: '还没有自定义分类',
    rename: '重命名',
    renameAria: '重命名分类「{{name}}」',
    delete: '删除',
    deleteAria: '删除分类「{{name}}」',
    deleteConfirmTitle: '删除分类',
    deleteConfirmMessage: '确定删除自定义分类「{{name}}」？',
    deletedToast: '已删除分类「{{name}}」',
    duplicate: '已存在同名分类（含官方分类）',
    inUse: '已被 {{count}} 本书使用，无法删除',
    deleteFailed: '删除失败，请重试'
  }
}

export default settings
