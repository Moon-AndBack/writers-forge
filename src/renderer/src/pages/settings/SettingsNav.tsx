import { useTranslation } from 'react-i18next'

/** 设置弹窗的分页标识（顺序即左侧导航顺序）。 */
export type SettingsPageId = 'general' | 'appearance' | 'ai' | 'categories' | 'data' | 'onedrive'

export interface SettingsNavProps {
  /** 当前页。 */
  active: SettingsPageId
  /** 切换页（由弹窗负责切页并重置内容区滚动）。 */
  onChange: (page: SettingsPageId) => void
}

/**
 * 设置弹窗左侧导航。
 *
 * - 语义：`<nav aria-label>` + 按钮，选中项用 `aria-current="page"`；
 *   不用 `role="tablist"`（项目无先例，且需要额外方向键与 roving tabindex）。
 * - 标签复用各分区现有标题 key（`settings:*` / `ai:section.title` /
 *   `onedrive:section.title`），不复制文案。
 * - 选中态严格按 AGENTS §8.5：品牌 12% + `--pane` 混合底、品牌文字 600 字重；
 *   hover 回落 `--soft-hover-solid`，不另造色条 / 下划线。
 */
export function SettingsNav({ active, onChange }: SettingsNavProps) {
  const { t } = useTranslation('settings')
  const { t: tAi } = useTranslation('ai')
  const { t: tOneDrive } = useTranslation('onedrive')

  const items: ReadonlyArray<{ id: SettingsPageId; label: string }> = [
    { id: 'general', label: t('general.title') },
    { id: 'appearance', label: t('appearance.title') },
    { id: 'ai', label: tAi('section.title') },
    { id: 'categories', label: t('categories.title') },
    { id: 'data', label: t('data.title') },
    { id: 'onedrive', label: tOneDrive('section.title') }
  ]

  return (
    <nav className="settings-nav" aria-label={t('nav.aria')}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="settings-nav__item"
          aria-current={item.id === active ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

SettingsNav.displayName = 'SettingsNav'

export default SettingsNav
