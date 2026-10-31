/**
 * 书籍表单封面区：封面色板 + 封面图预览 + 隐藏文件输入。
 *
 * 自 `BookFormDialog.tsx` 迁入（装配层只传 state 与回调）；封面字取书名首字
 * （无字时回退占位文案）。blob 生命周期由 `useBookForm` 管理，本组件纯展示。
 * 布局为左窄栏竖排（预览在上、色板在下），由 `book-form.css` 的 `.bf-cover` 控制；
 * 窄窗口（≤480px）回退横排。
 *
 * 「选择封面图」/「移除封面图」按钮在对话框 footer（`BookFormDialog`），本组件只保留
 * 隐藏的原生 file input 供 footer 按钮经 `fileRef.click()` 触发。
 */
import { useTranslation } from 'react-i18next'
import { ColorSwatchPicker, FormField } from '../../../components/ui'
import { COVER_SWATCHES, getCoverGradient } from '../bookMeta'
import type { ChangeEvent } from 'react'
import type { RefObject } from 'react'

/** 封面区 props：直接消费 `useBookForm` 的切片。 */
export interface CoverPickerProps {
  coverColor: string
  setCoverColor: (value: string) => void
  coverUrl: string | null
  coverChar: string
  fileRef: RefObject<HTMLInputElement | null>
  onCoverPick: (event: ChangeEvent<HTMLInputElement>) => void
}

export function CoverPicker({
  coverColor,
  setCoverColor,
  coverUrl,
  coverChar,
  fileRef,
  onCoverPick
}: CoverPickerProps) {
  const { t } = useTranslation('bookshelf')

  return (
    <FormField label={t('form.coverColor')} hint={t('form.coverHint')}>
      <div className="bf-cover">
        <div
          className="bf-cover__preview"
          style={coverUrl ? undefined : { backgroundImage: getCoverGradient(coverColor) }}
          aria-hidden="true"
        >
          {coverUrl ? (
            <img className="bf-cover__img" src={coverUrl} alt={t('form.coverPreviewAlt')} />
          ) : (
            <span className="bf-cover__char">{coverChar || t('form.coverCharFallback')}</span>
          )}
        </div>

        <div className="bf-cover__controls">
          <ColorSwatchPicker
            aria-label={t('form.coverColorAria')}
            colors={COVER_SWATCHES}
            value={coverColor}
            onChange={setCoverColor}
          />
          {/* 隐藏的原生文件选择框：仅由 footer「选择封面图」经 fileRef.click() 触发。 */}
          <input
            ref={fileRef}
            id="book-form-cover"
            className="bf-cover__file"
            type="file"
            accept="image/*"
            onChange={onCoverPick}
          />
        </div>
      </div>
    </FormField>
  )
}

export default CoverPicker
