import { useTranslation } from 'react-i18next'
import PopupSelect from '../../../shell/statusBarWidgets/PopupSelect'
import {
  CARD_MAX_HEIGHT_OPTIONS,
  CARD_MAX_WIDTH_OPTIONS,
  CARD_MIN_HEIGHT_OPTIONS,
  CARD_MIN_WIDTH_OPTIONS,
  useTimelineCardSize
} from './timelineCardContext'

/** 档位展示名：'none' 档走可译「不限制」，其余数值档直接展示字面值（数值不译，对齐排版组行距档）。 */
function optionLabel(value: string, noneLabel: string): string {
  return value === 'none' ? noneLabel : value
}

/**
 * 时间线卡片尺寸控件 ×4（最小宽度 / 最大宽度 / 最小高度 / 最大高度）。
 *
 * 各胶囊由 PopupSelect 呈现档位弹窗（§9 复用，不另写弹窗）；选中值经
 * useTimelineCardSize().setSize 写入对应 CSS 变量并防抖持久化（见 TimelineCardSizeProvider）。
 * 展示名 / 弹窗 aria-label 走 `timeline` i18n 命名空间（`cardSize.*`）。
 */
export default function TimelineCardSizeControls() {
  const { t } = useTranslation('timeline')
  const { size, setSize } = useTimelineCardSize()
  const noneLabel = t('cardSize.none')

  const toOptions = (values: readonly string[]): { value: string; label: string }[] =>
    values.map((value) => ({ value, label: optionLabel(value, noneLabel) }))

  return (
    <>
      <PopupSelect
        buttonLabel={t('cardSize.pill.minWidth', { value: size.minWidth })}
        popupLabel={t('cardSize.minWidth')}
        options={toOptions(CARD_MIN_WIDTH_OPTIONS)}
        value={size.minWidth}
        onChange={(minWidth) => setSize({ minWidth })}
      />
      <PopupSelect
        buttonLabel={t('cardSize.pill.maxWidth', { value: optionLabel(size.maxWidth, noneLabel) })}
        popupLabel={t('cardSize.maxWidth')}
        options={toOptions(CARD_MAX_WIDTH_OPTIONS)}
        value={size.maxWidth}
        onChange={(maxWidth) => setSize({ maxWidth })}
      />
      <PopupSelect
        buttonLabel={t('cardSize.pill.minHeight', { value: size.minHeight })}
        popupLabel={t('cardSize.minHeight')}
        options={toOptions(CARD_MIN_HEIGHT_OPTIONS)}
        value={size.minHeight}
        onChange={(minHeight) => setSize({ minHeight })}
      />
      <PopupSelect
        buttonLabel={t('cardSize.pill.maxHeight', {
          value: optionLabel(size.maxHeight, noneLabel)
        })}
        popupLabel={t('cardSize.maxHeight')}
        options={toOptions(CARD_MAX_HEIGHT_OPTIONS)}
        value={size.maxHeight}
        onChange={(maxHeight) => setSize({ maxHeight })}
      />
    </>
  )
}
