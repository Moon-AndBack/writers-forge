import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MorphIcon } from 'morphicons/react'
import { IconButton, Segmented, Switch } from '../components/ui'
import type { ResolvedThemeId, ThemeId } from '../theme/themes'
import { useTheme } from '../theme/useTheme'
import { useWindowMaterial } from '../theme/windowMaterial'
import type { WindowMaterialSetting } from '../theme/windowMaterial'
import { THEME_MORPH_ICONS } from './morphIcons'
import '../styles/theme-switcher.css'

/**
 * 标题栏主题入口（纯图标触发）+ 弹出面板。
 *
 * 面板结构（自上而下，按参考图）：
 *   1. 标题「外观主题」；
 *   2. 「跟随系统」开关行——开启即 `setTheme('system')`；关闭时落到当前解析主题
 *      （`resolvedTheme`），避免视觉跳变（等价「用当前选中的四主题之一」）；
 *   3. 「窗口材质」三档行——亚克力 / 云母 / 关闭，切换主进程 backgroundMaterial +
 *      根元素 `data-material` + settings 持久化（由 WindowMaterialProvider 负责）；
 *   4. 四张主题预览卡（light / dark / sage / honey）2 列网格——`system` 已由
 *      开关行取代，故不再出卡。点击任一卡 `setTheme(id)` 并关闭（持久化由
 *      ThemeProvider 负责），同时隐含关闭「跟随系统」（切到显式主题）。
 *
 * 选中态：`theme === 'system'` 时开关开、四卡均不选中；否则开关关、对应卡
 * 选中（`.is-selected`，品牌色描边高亮）。跟随系统时不额外高亮解析主题——保持
 * 「选中 = 用户显式选择」的语义清晰（可选增强，此处从略）。
 *
 * 卡面为「应用界面三栏缩影」（左图标条 / 中正文灰线条 / 右信息栏），用各主题
 * 固定色值渲染（见 theme-switcher.css 的 --mini-* 局部变量），不随当前文档主题
 * 变化（sage 弹窗下也能预览 light / honey）；仅调整布局（标题 / 开关 / 卡排列），
 * 未改动卡面以外的弹窗结构。
 *
 * 点外部 / Esc 关闭；展开时按钮加 `is-active` 高亮。
 *
 * 切换效果：切换主题时整屏交叉淡化（旧主题留在原地、新主题覆盖式淡入，View
 * Transitions，见 `theme/themeReveal.ts`），与点击位置无关；不支持 / 减少动效时
 * 直接瞬切。
 *
 * 触发按钮图标为 morphicons 形变图标（`MorphIcon` + Lucide `IconNode`）：
 * 解析主题在 light / dark / sage / honey 之间切换时，图标以弹簧物理平滑形变
 * （太阳 ↔ 月亮 ↔ 叶 ↔ 护眼），点击行为与按钮位置不变；`reducedMotion="user"`
 * 跟随系统「减少动效」偏好（开启时直接换图、不做形变）。
 */
export default function ThemeSwitcherPopover() {
  const { t } = useTranslation('theme')
  const { theme, themes, resolvedTheme, setTheme } = useTheme()
  const { material, supported: materialSupported, setMaterial } = useWindowMaterial()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const current = themes.find((item) => item.id === theme) ?? themes[0]
  const currentLabel = t(current.labelKey)

  // 四张显式主题卡（移除 `system`，它已由「跟随系统」开关行取代）。
  const themeCards = useMemo(
    () =>
      themes.filter((item) => item.id !== 'system') as ReadonlyArray<{
        id: ResolvedThemeId
        labelKey: ThemeId
      }>,
    [themes]
  )

  // 展开期间：Esc 关闭；指针按下落在根节点（按钮 + 浮层）之外时关闭。
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const pick = (id: ThemeId): void => {
    // 先关面板：面板卸载发生在旧快照拍摄之前，淡化时不会残留浮层收缩的残影
    setOpen(false)
    setTheme(id)
  }

  return (
    <div className="tb-theme-wrap" ref={rootRef}>
      <IconButton
        variant="ghost"
        className={`tb-theme-icon${open ? ' is-active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        label={t('triggerAria', { label: currentLabel })}
        tooltip={t('triggerTooltip', { label: currentLabel })}
        onClick={() => setOpen((value) => !value)}
      >
        <MorphIcon
          icon={THEME_MORPH_ICONS[resolvedTheme]}
          size={16}
          strokeWidth={1.9}
          reducedMotion="user"
        />
      </IconButton>

      {open ? (
        <div className="ts-popover" role="dialog" aria-label={t('popover.title')}>
          <div className="ts-title">{t('popover.title')}</div>

          <div className="ts-row">
            <div className="ts-row-text">
              <span className="ts-row-title">{t('followSystem.label')}</span>
              <span className="ts-row-sub">{t('followSystem.desc')}</span>
            </div>
            <Switch
              size="sm"
              checked={theme === 'system'}
              onChange={(event) => setTheme(event.target.checked ? 'system' : resolvedTheme)}
              aria-label={t('followSystem.label')}
            />
          </div>

          <div className="ts-row ts-row--stack">
            <div className="ts-row-text">
              <span className="ts-row-title">{t('material.label')}</span>
              <span className="ts-row-sub">
                {materialSupported ? t('material.supportedDesc') : t('material.unsupportedDesc')}
              </span>
            </div>
            <Segmented
              className="wf-seg--fill"
              options={[
                { value: 'acrylic', label: t('material.acrylic'), disabled: !materialSupported },
                { value: 'mica', label: t('material.mica'), disabled: !materialSupported },
                { value: 'none', label: t('material.none'), disabled: !materialSupported }
              ]}
              value={material}
              onChange={(value) => setMaterial(value as WindowMaterialSetting)}
              aria-label={t('material.aria')}
            />
          </div>

          <div className="ts-grid" role="group" aria-label={t('groupAria')}>
            {themeCards.map((item) => {
              const selected = item.id === theme
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`ts-option ts-card ts-card--${item.id}${selected ? ' is-selected' : ''}`}
                  aria-label={t(item.labelKey)}
                  aria-pressed={selected}
                  onClick={() => pick(item.id)}
                >
                  {/* 卡面缩影：左「图标条」+ 中「正文区（灰线条模拟文字）」+ 右「信息栏」，
                      各栏使用该主题的固定色值（局部变量，见 theme-switcher.css），
                      故任意当前主题下都能预览四主题各自的样子。 */}
                  <span className="ts-option-preview" aria-hidden="true">
                    <span className="ts-mini ts-mini--rail">
                      <span className="ts-mini-dot ts-mini-dot--active" />
                      <span className="ts-mini-dot" />
                      <span className="ts-mini-dot" />
                    </span>
                    <span className="ts-mini ts-mini--doc">
                      <span className="ts-mini-bar ts-mini-bar--title" />
                      <span className="ts-mini-bar ts-mini-bar--w1" />
                      <span className="ts-mini-bar ts-mini-bar--w2" />
                      <span className="ts-mini-bar ts-mini-bar--w3" />
                    </span>
                    <span className="ts-mini ts-mini--info">
                      <span className="ts-mini-chip" />
                      <span className="ts-mini-line" />
                      <span className="ts-mini-line ts-mini-line--short" />
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
