import { useTranslation } from 'react-i18next'
import PopupSelect from './PopupSelect'
import {
  FONT_OPTIONS,
  LETTER_OPTIONS,
  LINE_OPTIONS,
  PAGE_OPTIONS,
  useTypography
} from './typographyContext'

/** 排版胶囊标识（可经 `omit` 省略其中若干项）。 */
export type TypographyControlKey = 'font' | 'line' | 'letter' | 'page'

export interface TypographyControlsProps {
  /**
   * 省略的胶囊项（按场景裁剪：如无版心的面板可省略 `'page'` 页宽）。
   * 缺省渲染全部四项，与既有调用行为一致。
   *
   * 注意：`'page'` 仍可经此省略，但等价于 `showPage={false}`（保留元素、收窄隐藏，
   * 见下方渲染说明）；新代码请直接用 `showPage`。
   */
  omit?: readonly TypographyControlKey[]
  /**
   * 是否显示页宽胶囊（缺省 `true`）。
   *
   * 不用条件渲染卸载该项：页宽胶囊出现 / 消失时排版组右端会硬跳变，
   * 故改为「始终挂载 + `data-hidden` 控制收窄 / 淡出」，由 `.st-pill-swap`
   * 提供宽度过渡（见 statusbar-widgets.css）。
   */
  showPage?: boolean
}

/**
 * 状态栏排版胶囊 ×4（字体 / 行距 / 字距 / 页宽）。
 *
 * 各胶囊由 PopupSelect 呈现档位弹窗，选中值经 useTypography().setTypography
 * 写入对应 CSS 变量并防抖持久化（见 TypographyProvider）。
 * 档位展示名走 `typography` i18n 命名空间（labelKey）；字体品牌名亦为可译展示名。
 *
 * `omit` / `showPage` 用于按场景裁剪：省略页宽时仅保留字体 / 行距 / 字距
 * —— 与外壳全局组共用同一实现（§9，不复制）。
 *
 * 页宽胶囊例外：不卸载，始终渲染在 `.st-pill-swap` 包装里，靠 `data-hidden`
 * 收窄 + 淡出（宽度过渡），避免排版组整体硬跳。
 */
export default function TypographyControls({
  omit,
  showPage = true
}: TypographyControlsProps = {}) {
  const { t } = useTranslation('typography')
  const { typography, setTypography } = useTypography()
  const pageVisible = showPage && !omit?.includes('page')

  const fontLabel = (() => {
    const option = FONT_OPTIONS.find((item) => item.value === typography.font)
    if (!option) return t('font.system')
    return t(option.labelKey)
  })()
  const letterOption = LETTER_OPTIONS.find((option) => option.value === typography.letter)
  const letterLabel = t(letterOption?.labelKey ?? 'letter.standard')
  const pageOption = PAGE_OPTIONS.find((option) => option.value === typography.page)
  const pageLabel = t(pageOption?.labelKey ?? 'page.medium')

  return (
    <>
      {omit?.includes('font') ? null : (
        <PopupSelect
          buttonLabel={fontLabel}
          popupLabel={t('label.font')}
          options={FONT_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          value={typography.font}
          onChange={(font) => setTypography({ font })}
        />
      )}
      {omit?.includes('line') ? null : (
        <PopupSelect
          buttonLabel={typography.line}
          popupLabel={t('label.line')}
          options={LINE_OPTIONS.map((line) => ({ label: line, value: line }))}
          value={typography.line}
          onChange={(line) => setTypography({ line })}
        />
      )}
      {omit?.includes('letter') ? null : (
        <PopupSelect
          buttonLabel={letterLabel}
          popupLabel={t('label.letter')}
          options={LETTER_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          value={typography.letter}
          onChange={(letter) => setTypography({ letter })}
        />
      )}
      <span
        className="st-pill-swap"
        data-hidden={pageVisible ? 'false' : 'true'}
        aria-hidden={pageVisible ? undefined : true}
      >
        <PopupSelect
          buttonLabel={pageLabel}
          popupLabel={t('label.page')}
          options={PAGE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          value={typography.page}
          onChange={(page) => setTypography({ page })}
        />
      </span>
    </>
  )
}
