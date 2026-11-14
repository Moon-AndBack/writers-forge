/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 */
import type { ZhCNResources } from '../zh-CN'

const theme = {
  system: 'Follow system',
  light: 'Light',
  dark: 'Dark',
  sage: 'Sage',
  honey: 'Honey',
  popover: {
    title: 'Appearance theme'
  },
  followSystem: {
    label: 'Follow system',
    desc: 'Automatically switch the theme with the system light/dark setting'
  },
  material: {
    label: 'Window material',
    acrylic: 'Acrylic',
    mica: 'Mica',
    none: 'Off',
    supportedDesc:
      'Acrylic blurs live and is more see-through; Mica tints the wallpaper and looks more solid',
    unsupportedDesc: 'Not supported on this system (requires Windows 11 22H2+)',
    aria: 'Window material'
  },
  triggerAria: 'Theme: {{label}}, click to open the theme panel',
  triggerTooltip: 'Theme: {{label}} (click to switch)',
  groupAria: 'Interface theme'
} satisfies ZhCNResources['theme']

export default theme
