/**
 * 机翻占位 · 待校
 * 本文件英文译文由机器翻译生成，尚未人工校对；如见生硬 / 歧义，以 zh-CN 为准。
 * 说明：正文字体品牌展示名采用官方拉丁名 / 拼音机翻占位；字体档位的 `value`（CSS 族名）
 * 为不译常量，见 typographyContext.ts。
 */
import type { ZhCNResources } from '../zh-CN'

const typography = {
  font: {
    system: 'System default',
    alibabaPuHuiTi: 'Alibaba PuHuiTi',
    lxgwNeoXiHeiPlus: 'LXGW Neo XiHei Plus',
    lxgwWenKai: 'LXGW WenKai',
    lxgwWenKaiScreen: 'LXGW WenKai Screen',
    lxgwZhenKaiGB: 'LXGW ZhenKai GB',
    miSans: 'MiSans',
    moonStarsKai: 'Moon Stars Kai',
    wenYuanRounded: 'WenYuan Rounded'
  },
  letter: {
    compact: 'Compact',
    standard: 'Standard',
    loose: 'Loose',
    airy: 'Airy',
    veryAiry: 'Very airy'
  },
  page: {
    narrow: 'Narrow',
    medium: 'Medium',
    wide: 'Wide',
    full: 'Full width'
  },
  label: {
    font: 'Body font',
    line: 'Line height',
    letter: 'Letter spacing',
    page: 'Page width'
  }
} satisfies ZhCNResources['typography']

export default typography
