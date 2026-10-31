import type { IconInput } from 'morphicons/react'
import {
  ArrowLeft,
  CircleQuestionMark,
  Eye,
  Leaf,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Settings,
  Sun,
  X
} from 'lucide'
import type { ResolvedThemeId } from '../theme/themes'

/**
 * 形变图标数据（morphicons + Lucide `IconNode`）。
 *
 * morphicons 把图标当作**数据**消费（Lucide 的 `[tag, attrs][]` 结构），
 * 因此从 `lucide`（图标数据包，非 `lucide-react` 组件包）按名引入所需图标：
 * Vite 依据 `sideEffects: false` 与具名导入做 tree-shaking，产物只含用到的
 * 这几个图标，不会打进整包。
 *
 * 集中在此处的好处：形变对（两态 / 四态）与业务组件解耦，后续新增形变按钮
 * 只需在此登记图标数据。
 */

/** 主题按钮四态（按解析后的实际主题）→ Lucide 图标：亮色太阳 / 暗色月亮 / 浅绿叶 / 浅黄护眼。 */
export const THEME_MORPH_ICONS: Record<ResolvedThemeId, IconInput> = {
  light: Sun,
  dark: Moon,
  sage: Leaf,
  honey: Eye
}

/** 右栏开关两态：显示中（箭头朝面板 = 可收起）/ 已收起（箭头离开面板 = 可展开）。 */
export const RIGHT_PANE_MORPH_ICONS: Record<'shown' | 'hidden', IconInput> = {
  shown: PanelRightClose,
  hidden: PanelRightOpen
}

/**
 * 标题栏图标（返回 / 设置 / 关闭 / 帮助）：同为 Lucide `IconNode`。返回与帮助为
 * 静态单态（`reducedMotion="always"`）；设置齿轮在「设置弹窗关闭 / 打开」两态间
 * 切换为 `close`（×），由 `TitleBar` 以 `reducedMotion="user"` 渲染，开合弹窗时形变。
 */
export const TITLEBAR_ICONS: Record<'back' | 'settings' | 'close' | 'help', IconInput> = {
  back: ArrowLeft,
  settings: Settings,
  close: X,
  help: CircleQuestionMark
}
