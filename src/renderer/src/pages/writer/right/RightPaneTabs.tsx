import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Segmented } from '../../../components/ui'

/** 右栏「大纲 / 剧情 / 伏笔 / AI」页签值。 */
export type RightPaneTab = 'outline' | 'plot' | 'foreshadow' | 'ai'

export interface RightPaneTabsProps {
  /** 当前页签（受控）。 */
  value: RightPaneTab
  /** 页签切换回调。 */
  onChange: (value: RightPaneTab) => void
}

/**
 * 章节模块右栏的「大纲 / 剧情 / 伏笔 / AI」页签条：复用通用 `Segmented`（§9 不另造分段控件）。
 * 「AI」页签挂载 `AiPanel`（模型 / 功能下拉 + 快捷结果或对话列表，结果可回插正文）；
 * 「伏笔」页签挂载全书伏笔只读总览（按派生状态分组，不选中 / 不跳转）。
 *
 * 仅在「章节」模块的右栏出现（大纲模块右栏与「剧情」页签同款面板但不带页签条，
 * 剧情模块右栏为节点正文编辑器）；外观与书架工具条的分段控件同款——外层只留
 * 栏级间距，不叠卡片底 / 描边，尺寸档同为默认 `md`。
 */
export function RightPaneTabs({ value, onChange }: RightPaneTabsProps): ReactElement {
  const { t } = useTranslation('writer')
  return (
    <div className="rp-tabs">
      <Segmented<RightPaneTab>
        className="rp-tabs__seg"
        value={value}
        onChange={onChange}
        aria-label={t('rightTabs.aria')}
        options={[
          { value: 'outline', label: t('rightTabs.outline') },
          { value: 'plot', label: t('rightTabs.plot') },
          { value: 'foreshadow', label: t('rightTabs.foreshadow') },
          { value: 'ai', label: t('rightTabs.ai') }
        ]}
      />
    </div>
  )
}

export default RightPaneTabs
