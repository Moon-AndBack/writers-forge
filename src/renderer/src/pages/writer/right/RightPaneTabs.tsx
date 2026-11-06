import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '../../../components/ui'
import { CHAPTER_RIGHT_PANE_TABS, type RightPaneTab } from './rightPaneTabSets'

export type { RightPaneTab } from './rightPaneTabSets'

/** 页签 → 文案 key（静态映射，避免拼接 key 丢类型）。 */
const TAB_LABEL_KEYS = {
  outline: 'rightTabs.outline',
  plot: 'rightTabs.plot',
  foreshadow: 'rightTabs.foreshadow',
  inspiration: 'rightTabs.inspiration',
  ai: 'rightTabs.ai'
} as const satisfies Record<RightPaneTab, string>

export interface RightPaneTabsProps {
  /** 当前页签（受控）。 */
  value: RightPaneTab
  /** 页签切换回调。 */
  onChange: (value: RightPaneTab) => void
  /** 要渲染的页签子集与顺序；缺省 = 章节模块全量五项（向后兼容）。 */
  tabs?: readonly RightPaneTab[]
}

/**
 * 右栏页签条（章节模块五项 / 大纲模块三项）：复用通用 `Segmented`（§9 不另造分段控件）。
 *
 * 渲染项由 `tabs` 决定（缺省 `CHAPTER_RIGHT_PANE_TABS`），文案仍走 `rightTabs.*`：
 * - 章节模块：大纲 / 剧情 / 伏笔 / 灵感 / AI，挂载 `OutlineRightPanel` / `PlotFilterPanel` /
 *   `ForeshadowOverviewPanel` / `InspirationOverviewPanel` / `AiPanel`；
 * - 大纲模块：剧情 / 伏笔 / 灵感（不含大纲与 AI），与章节页共用同一套面板实例。
 *
 * 「剧情」页签挂载双下拉筛选 + 只读时间轴卡片；「伏笔」页签挂载全书伏笔只读总览（按派生状态
 * 分组，不选中 / 不跳转）；「灵感」页签挂载全书灵感只读平铺总览（点卡片在右栏内展开只读详情）。
 * 外观与书架工具条的分段控件同款——外层只留栏级间距，不叠卡片底 / 描边，尺寸档同为默认 `md`。
 */
export function RightPaneTabs({
  value,
  onChange,
  tabs = CHAPTER_RIGHT_PANE_TABS
}: RightPaneTabsProps): ReactElement {
  const { t } = useTranslation('writer')
  return (
    <div className="rp-tabs">
      <Segmented<RightPaneTab>
        className="rp-tabs__seg"
        value={value}
        onChange={onChange}
        aria-label={t('rightTabs.aria')}
        options={tabs.map((tab) => ({ value: tab, label: t(TAB_LABEL_KEYS[tab]) }))}
      />
    </div>
  )
}

export default RightPaneTabs
