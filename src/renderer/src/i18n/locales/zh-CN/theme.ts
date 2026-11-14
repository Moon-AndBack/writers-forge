/**
 * 主题命名空间（`theme`）：五档主题展示名 + 主题弹出面板文案。
 * 主题展示名的键与 `ThemeId`（system / light / dark / sage / honey）一一对应，
 * 供 `THEMES[].labelKey` 取用。
 */
const theme = {
  system: '跟随系统',
  light: '亮色模式',
  dark: '暗色模式',
  sage: '浅绿模式',
  honey: '浅黄模式',
  popover: {
    title: '外观主题'
  },
  followSystem: {
    label: '跟随系统',
    desc: '随系统明暗自动切换主题'
  },
  material: {
    label: '窗口材质',
    acrylic: '亚克力',
    mica: '云母',
    tabbed: '云母（增强）',
    none: '关闭',
    supportedDesc: '亚克力实时模糊更透；云母偏实色；云母（增强）着色更强、仍不透明',
    unsupportedDesc: '当前系统不支持（需 Windows 11 22H2+）',
    aria: '窗口材质'
  },
  triggerAria: '主题：{{label}}，点击打开主题面板',
  triggerTooltip: '主题：{{label}}（点击切换）',
  groupAria: '界面主题'
}

export default theme
