/**
 * 书籍表单基础字段区：书名 / 简介 / 状态（六态）/ 频道 / 篇幅。
 *
 * 自 `BookFormDialog.tsx` 迁入（装配层只传 state 与回调）；状态选项顺序沿用
 * 主进程 `BOOK_STATUSES`，状态 / 频道 / 篇幅均为下拉（Select），其中频道 / 篇幅
 * 可空——以「未设置」空项映射 null。作者不再是表单字段（全局笔名 `settings.penName`）。
 * 控件统一 md 尺寸（≈38px），不使用 size="sm"。
 */
import { useTranslation } from 'react-i18next'
import { FormField, Input, Select, Textarea } from '../../../components/ui'
import { BOOK_CHANNEL_OPTIONS, BOOK_LENGTH_OPTIONS, BOOK_STATUS_OPTIONS } from '../bookMeta'
import type { UseBookFormResult } from './useBookForm'
import type { BookChannel, BookLength, BookStatus } from './types'

/** 基础字段区 props：直接消费 `useBookForm` 的切片（避免逐字段透传爆炸）。 */
export interface BasicFieldsProps {
  form: Pick<
    UseBookFormResult,
    | 'titleValue'
    | 'setTitleValue'
    | 'onTitleBlur'
    | 'showError'
    | 'intro'
    | 'setIntro'
    | 'status'
    | 'setStatus'
    | 'channel'
    | 'setChannel'
    | 'lengthType'
    | 'setLengthType'
  >
}

export function BasicFields({ form }: BasicFieldsProps) {
  const { t } = useTranslation('bookshelf')

  return (
    <>
      <FormField
        label={t('form.title')}
        htmlFor="book-form-title"
        required
        error={form.showError ? t('form.titleRequired') : undefined}
      >
        <Input
          id="book-form-title"
          value={form.titleValue}
          placeholder={t('form.titlePlaceholder')}
          autoComplete="off"
          invalid={form.showError}
          onChange={(event) => form.setTitleValue(event.target.value)}
          onBlur={form.onTitleBlur}
        />
      </FormField>

      <FormField label={t('form.intro')} htmlFor="book-form-intro">
        <Textarea
          id="book-form-intro"
          rows={3}
          value={form.intro}
          placeholder={t('form.introPlaceholder')}
          onChange={(event) => form.setIntro(event.target.value)}
        />
      </FormField>

      <FormField label={t('form.status')}>
        <Select
          ariaLabel={t('form.statusAria')}
          options={BOOK_STATUS_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          value={form.status}
          onChange={(value) => form.setStatus(value as BookStatus)}
        />
      </FormField>

      <div className="bf-row">
        <FormField label={t('form.channel')} hint={t('form.channelHint')}>
          <Select
            ariaLabel={t('form.channelAria')}
            options={[
              { value: '', label: t('form.unset') },
              ...BOOK_CHANNEL_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey)
              }))
            ]}
            value={form.channel ?? ''}
            onChange={(value) => form.setChannel(value === '' ? null : (value as BookChannel))}
          />
        </FormField>

        <FormField label={t('form.lengthType')} hint={t('form.lengthHint')}>
          <Select
            ariaLabel={t('form.lengthAria')}
            options={[
              { value: '', label: t('form.unset') },
              ...BOOK_LENGTH_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.labelKey)
              }))
            ]}
            value={form.lengthType ?? ''}
            onChange={(value) => form.setLengthType(value === '' ? null : (value as BookLength))}
          />
        </FormField>
      </div>
    </>
  )
}

export default BasicFields
