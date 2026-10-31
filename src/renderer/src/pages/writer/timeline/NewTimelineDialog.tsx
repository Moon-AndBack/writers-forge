import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal } from '../../../components/ui'

export interface NewTimelineDialogProps {
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交新建（name 可空 → 默认名；origin 可空 → 空起点）。 */
  onSubmit: (name: string, origin: string) => void
}

export default function NewTimelineDialog({ onClose, onSubmit }: NewTimelineDialogProps) {
  const { t } = useTranslation('timeline')
  const { t: tCommon } = useTranslation('common')
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const submit = (): void => {
    onSubmit(name, origin)
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
        <FormField label={t('newDialog.originLabel')} htmlFor="new-timeline-origin">
          <Input
            id="new-timeline-origin"
            value={origin}
            placeholder={t('newDialog.originPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setOrigin(event.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  )
}