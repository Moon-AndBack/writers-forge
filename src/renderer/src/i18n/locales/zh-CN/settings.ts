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
  nav: {
    aria: '设置分区导航'
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
    description: '界面主题与显示偏好'
  },
  themeMode: {
    label: '主题模式',
    description: '跟随系统或指定明暗 / 预设主题'
  },
  paperLines: {
    label: '稿纸横线',
    description: '在章节与大纲的编辑区每行下方显示一条虚线（右栏只读正文不显示）'
  },
  data: {
    title: '数据与备份',
    description: '本地备份、恢复与整库导出',
    create: {
      label: '立即备份',
      description: '创建一份本地整库快照',
      action: '立即备份',
      successToast: '备份已创建：{{name}}'
    },
    backups: {
      title: '备份列表',
      count: '共 {{count}} 份',
      loading: '正在读取本地备份…',
      empty: '还没有本地备份',
      restoreFile: '从文件恢复…',
      restoreFileHint: '选择任意 .db 文件恢复整库',
      restoreAria: '恢复备份「{{name}}」',
      renameAria: '重命名备份「{{name}}」',
      renamePlaceholder: '备份名称',
      deleteAria: '删除备份「{{name}}」',
      deleteConfirmTitle: '删除备份',
      deleteConfirmMessage: '确定删除备份「{{name}}」？此操作不可恢复。',
      delete: '删除',
      deletedToast: '已删除备份「{{name}}」',
      kindManual: '手动备份',
      kindPreRestore: '恢复前安全副本'
    },
    export: {
      label: '导出',
      description: '导出整库数据库文件（.db）',
      action: '导出数据库文件',
      successToast: '数据库文件已导出'
    },
    location: {
      label: '数据目录',
      description: '备份与应用数据存放在本机',
      action: '打开备份文件夹',
      successToast: '已打开备份文件夹'
    },
    restore: {
      title: '恢复备份',
      confirm: '覆盖并恢复',
      confirmCover: '将用备份「{{name}}」覆盖当前全部数据。',
      confirmCoverFile: '将用所选备份文件覆盖当前全部数据。',
      confirmSafeCopy: '恢复前会自动创建一份安全副本，当前数据可回退。',
      confirmRestart: '恢复成功后应用会自动重启。',
      confirmFlush: '未保存的编辑会先尝试保存。',
      restarting: '正在恢复并重启…',
      successToast: '恢复完成，应用即将重启'
    },
    error: {
      backup_in_progress: '已有备份或恢复任务正在进行，请稍后再试。',
      snapshot_failed: '生成数据库快照失败，请重试。',
      invalid_file: '所选文件不是有效的备份文件。',
      corrupt: '备份文件已损坏，无法恢复。',
      copy_failed: '复制备份文件失败，请检查磁盘空间与权限。',
      safe_copy_failed: '创建恢复前安全副本失败，已中止恢复。',
      restore_failed: '恢复失败，当前数据未被替换。',
      invalid_name: '备份文件夹名不合法。',
      not_found: '备份不存在，可能已被移动或删除。',
      list_failed: '读取备份列表失败。',
      delete_failed: '删除备份失败，请重试。',
      export_failed: '导出数据库文件失败。',
      open_failed: '打开备份文件夹失败。',
      canceled: '操作已取消。',
      conflict: '已存在同名备份，请换一个名称。',
      rename_failed: '重命名备份失败，请重试。'
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
  },
  reset: {
    label: '重置为默认',
    confirmTitle: '重置为默认',
    confirmMessage:
      '将把界面语言、自动保存、默认打开视图、主题模式与稿纸横线五项恢复默认值（语言改为跟随系统）。不会删除书籍、章节、大纲、实体、自定义分类或备份文件，也不会退出 AI 与 OneDrive 登录。默认打开视图在下次启动时生效。',
    confirmAction: '重置',
    doneToast: '已重置为默认设置'
  }
}

export default settings
