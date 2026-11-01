/**
 * 排版命名空间（`typography`）：状态栏排版胶囊的档位展示名与弹窗标签。
 * 正文字体展示名（含 6 个字体品牌名）随语言切换；字体档位的 `value`（CSS 族名）
 * 仍为不译常量，保留在 typographyContext.ts 中。
 */
const typography = {
  font: {
    system: '系统默认',
    lxgwNeoXiHeiPlus: '霞鹜新晰黑＋',
    lxgwWenKai: '霞鹜文楷',
    lxgwWenKaiScreen: '霞鹜文楷屏幕版',
    lxgwZhenKaiGB: '霞鹜臻楷 GB',
    moonStarsKai: '月星楷',
    wenYuanRounded: '文渊圆体'
  },
  letter: {
    compact: '紧凑',
    standard: '标准',
    loose: '宽松',
    airy: '疏朗',
    veryAiry: '极疏'
  },
  page: {
    narrow: '窄',
    medium: '适中',
    wide: '宽',
    full: '全宽'
  },
  label: {
    font: '正文字体',
    line: '行距',
    letter: '字距',
    page: '页宽'
  }
}

export default typography
