import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ShortRichTextField from '../../../components/editor/ShortRichTextField'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import { Button, FormField, Input, Modal } from '../../../components/ui'

/** 空正文归一值（与 `useRichTextBodyEditor` 同口径；模块级常量保证引用稳定）。 */
const EMPTY_VALUE: RichTextBodyValue = { text: '', json: null }

export interface NewTimelineDialogProps {
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交新建（name 可空 → 默认名；description 为富文本归一值，可空 → 空起点描述）。 */
  onSubmit: (name: string, description: RichTextBodyValue) => void
}

export default function NewTimelineDialog({ onClose, onSubmit }: NewTimelineDialogProps) {
  const { t } = useTranslation('timeline')
  const { t: tCommon } = useTranslation('common')
  const [name, setName] = useState('')
  const [description, setDescription] = useState<RichTextBodyValue>(EMPTY_VALUE)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const submit = (): void => {
    onSubmit(name, description)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('newDialog.title')}
      size="sm"
      ariaLabel={t('newDialog.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {tCommon('confirm')}
          </Button>
        </>
      }
    >
      <div className="timeline-new-dialog">
        <FormField label={t('newDialog.nameLabel')} htmlFor="new-timeline-name">
          <Input
            ref={inputRef}
            id="new-timeline-name"
            value={name}
            placeholder={t('newDialog.namePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </FormField>
        <FormField label={t('newDialog.descLabel')}>
          {/* 富文本字段：不传 `fill`，弹窗内按内容高度（最小 82px / 最大 200px，超出内部滚动）。
              富文本区不是原生 labelable 控件，故不走 `htmlFor`，改用 `ariaLabel`。 */}
          <ShortRichTextField
            initialJson={null}
            onChange={setDescription}
            placeholder={t('newDialog.descPlaceholder')}
            ariaLabel={t('newDialog.descLabel')}
          />
        </FormField>
      </div>
    </Modal>
  )
}
