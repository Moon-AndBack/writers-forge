import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal, Segmented } from '../../../components/ui'
import type { ChapterPin } from './chapterTree'

export interface SpecialChapterDialogProps {
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 确认：传出前段（specialPrefix）、名段（title，均保证非空）与置顶 / 置底（pin）。 */
  onSubmit: (input: { specialPrefix: string; title: string; pin: ChapterPin }) => void
}

/**
 * 「新建特殊章」轻量弹窗（复用 `SpecialVolumeDialog` / `Modal` 风格）：
 * 双输入（左 = 前段如「序章 / 番外」，右 = 名段），两段均必填
 * （后端 `createChapter`：特殊章须有前段 + 名段）。
 */
export default function SpecialChapterDialog({ onClose, onSubmit }: SpecialChapterDialogProps) {
  const { t } = useTranslation('chapters')
  const { t: tCommon } = useTranslation('common')
  const [prefix, setPrefix] = useState('')
  const [name, setName] = useState('')
  const [pin, setPin] = useState<ChapterPin>('top')
  // 已尝试提交 / 已触碰标记：为真后空字段进入错误态（按钮可点，点后给出必填提示）。
  const [touched, setTouched] = useState(false)
  const prefixRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回前段输入框。
  useEffect(() => {
    const id = window.setTimeout(() => prefixRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const trimmedPrefix = prefix.trim()
  const trimmedName = name.trim()
  const canSubmit = trimmedPrefix !== '' && trimmedName !== ''
  // 错误态仅在提交尝试 / 失焦触碰后展示，避免打开即报错。
  const showPrefixError = touched && trimmedPrefix === ''
  const showNameError = touched && trimmedName === ''

  const submit = (): void => {
    // 前缀 / 名段为空时不静默失败：标记触碰态，字段下方给出必填提示。
    if (!canSubmit) {
      setTouched(true)
      return
    }
    onSubmit({ specialPrefix: trimmedPrefix, title: trimmedName, pin })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('specialChapterDialog.title')}
      size="sm"
      ariaLabel={t('specialChapterDialog.title')}
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
      <div className="special-chapter-dialog">
        {/* 位置在最上：满宽 + 与下方输入框等高的分段控件（通用类 .wf-seg--fill）。
            用默认尺寸而非 size="sm"：md 字号 12.5px 与 input.wf-input 的 13px 同档。 */}
        <FormField label={t('specialChapterDialog.positionLabel')}>
          <Segmented
            className="wf-seg--fill"
            aria-label={t('specialChapterDialog.positionAria')}
            value={pin}
            onChange={(value) => setPin(value as ChapterPin)}
            options={[
              { value: 'top', label: t('specialChapterDialog.pinTop') },
              { value: 'bottom', label: t('specialChapterDialog.pinBottom') }
            ]}
          />
        </FormField>
        <FormField
          label={t('specialChapterDialog.prefixLabel')}
          htmlFor="special-chapter-prefix"
          required
          error={showPrefixError ? t('specialChapterDialog.prefixRequired') : undefined}
        >
          <Input
            id="special-chapter-prefix"
            ref={prefixRef}
            value={prefix}
            placeholder={t('specialChapterDialog.prefixPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            invalid={showPrefixError}
            onChange={(event) => setPrefix(event.target.value)}
            onBlur={() => setTouched(true)}
          />
        </FormField>
        <FormField
          label={t('specialChapterDialog.nameLabel')}
          htmlFor="special-chapter-name"
          required
          error={showNameError ? t('specialChapterDialog.nameRequired') : undefined}
        >
          <Input
            id="special-chapter-name"
            value={name}
            placeholder={t('specialChapterDialog.namePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            invalid={showNameError}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                submit()
              }
            }}
          />
        </FormField>
      </div>
    </Modal>
  )
}
