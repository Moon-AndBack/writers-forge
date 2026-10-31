import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { MorphIcon } from 'morphicons/react'
import { IconButton } from '../components/ui'
import SettingsDialog from '../components/dialogs/SettingsDialog'
import { useActivityActions } from './activityActions'
import { useActivityBar, useModuleLabel } from './activityBar'
import { RIGHT_PANE_MORPH_ICONS, TITLEBAR_ICONS } from './morphIcons'
import { BrandIcon } from './brandIcon'
import { useRightPaneVisibility } from './rightPaneVisibility'
import ThemeSwitcherPopover from './ThemeSwitcherPopover'
import { useTitleBarActions } from './titleBarActions'
import '../styles/titlebar.css'

/**
 * 外壳标题栏（<header class="titlebar">）。
 *
 * 布局（左 → 右）：
 *   brand → [返回图标（仅写作页）] → [模块操作按钮组（仅写作页 · 有注册动作的模块）] →
 *   页面上下文操作插槽（.tb-page-actions，书籍页注册「新建书籍」加号；写作页无额外操作）
 *   → .tb-spacer → .tb-right-tools（设置 · 右栏开关 · 主题 · 帮助）→（系统窗口控制按钮由
 *   titleBarOverlay 绘制）。
 *
 * - 返回图标由本组件按路由渲染（写作页才有），点击回到书架（`/`）；
 * - 模块操作按钮组（章节：新建卷 / 保存 / 撤销 / 重做 / 搜索 / 回收站；
 *   大纲：添加 / 保存 / 撤销 / 重做 / 搜索 / 回收站）
 *   由各模块视图经模块级 action 插槽（`useActivityActions(active)`）注册，
 *   此处渲染在返回图标右侧（`.tb-module-actions`），仅写作页有注册动作的模块有值；
 * - 设置入口为**弹窗**（`SettingsDialog`）：齿轮点击打开，打开期间齿轮形变为 ×、
 *   再次点击关闭；品牌名不再随设置变化。帮助仍为**占位**入口（无路由/页面，点击无操作）。
 *   右栏面板开关全页面显示（active 高亮 = 右栏**实际**显示中；窄窗由 CSS 强制
 *   隐藏右栏时按钮同步为不可用，窗口变宽后按用户偏好恢复），
 *   主题入口沿用 `ThemeSwitcherPopover`（改为纯图标触发，弹窗内容见其实现）；
 * - `.tb-right-tools` 置于 `.tb-spacer` 之后、系统预留区之前，不与系统按钮重叠；
 * - 标题栏整体 `-webkit-app-region: drag`，内部交互元素由 shell.css 统一
 *   `no-drag`（`.titlebar button` 等），故图标/按钮均可点击。
 */
export interface TitleBarProps {
  /**
   * 引导未完成时为 true：设置齿轮禁用，避免首启（仅欢迎页）打开依赖已落库偏好的
   * 设置项。门控状态的真源在 `App`（`useOnboarding`），此处只接收结果，不再另读一次。
   */
  settingsLocked?: boolean
}

export default function TitleBar({ settingsLocked = false }: TitleBarProps) {
  const { t } = useTranslation('titlebar')
  const { t: tCommon } = useTranslation('common')
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isWriter = pathname.startsWith('/write/')
  const { active } = useActivityBar()
  const moduleLabel = useModuleLabel(active)

  // 设置弹窗开关：由标题栏齿轮持有（弹窗挂在本组件末尾）。
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 品牌名随上下文派生：写作页显示当前活动模块名（如「章节」，模块栏切换时随
  // Provider 的 active 实时更新）；其余显示「书架」。
  const brandName = isWriter ? moduleLabel : t('bookshelf')

  // 章节操作按钮组：由当前活动模块注册（写作页 · 章节模块才有值；其它模块 / 页面为 null）。
  const activityActions = useActivityActions(active)

  const actions = useTitleBarActions()

  // 右栏显隐（用户偏好，settings 持久化）：按钮全页面渲染、读写；
  // 写作页实际消费显隐（非写作页点击仅记录状态，回到写作页时生效）。
  // 按钮态取 `effectiveHidden`（偏好隐藏 OR 窄窗强制隐藏），保证与实际右栏一致；
  // 窄窗下按钮禁用并提示，避免「高亮但右栏不存在」的误导。
  const {
    effectiveHidden: rightPaneEffectiveHidden,
    narrow: rightPaneNarrow,
    toggle: toggleRightPane
  } = useRightPaneVisibility()

  const handleBack = useCallback((): void => {
    navigate('/')
  }, [navigate])

  // 设置弹窗开关：引导未完成时不得打开（首启只有欢迎页，设置项依赖已落库的
  // 偏好）。打开期间齿轮形变为 ×，再次点击关闭；弹窗自带的遮罩 / Esc / 头部 ×
  // 亦可关闭。
  const handleToggleSettings = useCallback((): void => {
    if (settingsLocked) return
    setSettingsOpen((open) => !open)
  }, [settingsLocked])

  // 右栏开关文案：窄窗优先提示不可用；否则随实际显隐切换「显示 / 隐藏」。
  const rightPaneLabel = rightPaneNarrow
    ? t('rightPaneNarrow')
    : rightPaneEffectiveHidden
      ? t('showRightPane')
      : t('hideRightPane')

  return (
    <>
      <header className="titlebar">
        {!isWriter ? (
          <div className="tb-brand">
            <span className="tb-brand-mark" aria-hidden="true">
              <BrandIcon />
            </span>
            <span className="tb-brand-name">{brandName}</span>
          </div>
        ) : null}

        {isWriter ? (
          <IconButton
            variant="ghost"
            className="tb-back"
            label={t('backToBookshelf')}
            onClick={handleBack}
          >
            {/* 静态 Lucide 图标（返回箭头），不做两态形变。 */}
            <MorphIcon
              icon={TITLEBAR_ICONS.back}
              size={16}
              strokeWidth={1.9}
              reducedMotion="always"
            />
          </IconButton>
        ) : null}

        {isWriter ? <span className="tb-brand-name">{brandName}</span> : null}

        {isWriter ? <div className="tb-module-actions">{activityActions}</div> : null}

        <div className="tb-page-actions">{actions}</div>

        <div className="tb-spacer" />

        <div className="tb-right-tools">
          {/* 设置：齿轮点击打开弹窗；打开期间同一按钮形变为 ×，再次点击关闭。
              引导未完成（首启）时禁用——设置项依赖已落库的偏好。 */}
          <IconButton
            variant="ghost"
            className="tb-tool"
            label={settingsOpen ? tCommon('close') : t('settings')}
            tooltip={settingsOpen ? tCommon('close') : t('settings')}
            disabled={settingsLocked}
            onClick={handleToggleSettings}
          >
            {/* 两态形变：齿轮 ↔ ×；reducedMotion="user" 跟随系统减少动效偏好。
                两态结构差异较大，用 smooth 弹簧避免过冲带来的杂乱观感。 */}
            <MorphIcon
              icon={settingsOpen ? TITLEBAR_ICONS.close : TITLEBAR_ICONS.settings}
              size={16}
              strokeWidth={1.9}
              spring="smooth"
              reducedMotion="user"
            />
          </IconButton>

          {/* 右栏面板开关：全页面显示；active 高亮 = 右栏实际显示中。
              图标为 morphicons 形变图标：收起 / 展开时在「面板 + 向内箭头」与
              「面板 + 向外箭头」两态间平滑形变（`reducedMotion="user"` 跟随系统
              减少动效偏好）；点击行为与按钮位置不变。
              窄窗（≤1240px）时 CSS 强制隐藏右栏，按钮同步禁用并提示，
              避免按钮高亮而右栏不可见。 */}
          <IconButton
            variant="ghost"
            className={`tb-tool tb-pane-toggle${!rightPaneEffectiveHidden ? ' is-active' : ''}`}
            label={rightPaneLabel}
            tooltip={rightPaneLabel}
            aria-pressed={!rightPaneEffectiveHidden}
            disabled={rightPaneNarrow}
            onClick={toggleRightPane}
          >
            <MorphIcon
              icon={
                rightPaneEffectiveHidden
                  ? RIGHT_PANE_MORPH_ICONS.hidden
                  : RIGHT_PANE_MORPH_ICONS.shown
              }
              size={16}
              strokeWidth={1.9}
              reducedMotion="user"
            />
          </IconButton>

          <ThemeSwitcherPopover />

          {/* 帮助：占位入口（无页面/路由，点击无操作） */}
          <IconButton
            variant="ghost"
            className="tb-tool"
            label={t('help')}
            tooltip={t('helpComingSoon')}
          >
            {/* 静态 Lucide 图标（问号圆）。 */}
            <MorphIcon
              icon={TITLEBAR_ICONS.help}
              size={16}
              strokeWidth={1.9}
              reducedMotion="always"
            />
          </IconButton>
        </div>
      </header>

      {/* 设置弹窗：portal 挂到 body，置于 #root 之外；状态由标题栏齿轮持有。 */}
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  )
}
