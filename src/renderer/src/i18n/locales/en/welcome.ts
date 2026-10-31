/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 */
import type { ZhCNResources } from '../zh-CN'

const welcome = {
  title: "Welcome to Writer's Forge",
  desc: 'Pick a pen name you can live with — it will appear on your works and in the interface.',
  start: 'Get started',
  penName: {
    label: 'Pen name',
    hint: 'Used only as your signature; you can change it anytime later.',
    errorRequired: 'Please enter a pen name to continue.',
    placeholder: 'e.g. Mountain Hermit',
    tooLong: 'Entered {{count}} characters; consider keeping it within {{max}}.'
  }
} satisfies ZhCNResources['welcome']

export default welcome
