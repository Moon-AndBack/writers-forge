import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal, Segmented } from '../ui'
import '../../styles/components/new-volume-dialog.css'

export interface NewVolumeDialogProps {
  /** 书籍 id（历史兼容：调用方仍传入；卷号预览已移除，组件内暂无用途）。 */
  bookId: string
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /**
   * 提交创建卷入参（映射主进程 `CreateVolumeInput`）：
   * - 正文卷 → `{ kind: 'normal', title }`（`title` 可空 = 自动「卷X」编号）；
   * - 自定义卷 → `{ kind: 'custom', title }`（`title` 必填 = 完整整名，不编号）。
   */
  onSubmit: (input: { kind: 'normal' | 'custom'; title: string }) => void
}

type Mode = 'normal' | 'custom'

/**
 * 「新建卷」弹窗：顶部 Segmented 二选一形态，两形态均为单输入。
 * - **正文卷**（`kind='normal'`）：单个可空的卷名段输入（如「风起卷」；留空则自动编号为「卷X」）；
 * - **自定义卷**（`kind='custom'`）：单个必填输入整名（如「番外」「作品相关」，不编号）。
 */
export default function NewVolumeDialog({ onClose, onSubmit }: NewVolumeDialogProps) {
  const { t } = useTranslation('chapters')
  const { t: tCommon } = useTranslation('common')
  const [mode, setMode] = useState<Mode>('normal')
  const [customName, setCustomName] = useState('')
  const [specialName, setSpecialName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回输入框。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const trimmedCustom = customName.trim()
  const trimmedSpecial = specialName.trim()
  const canSubmit = mode === 'normal' || trimmedSpecial !== ''

  const submit = (): void => {
    if (!canSubmit) return
    if (mode === 'normal') {
      onSubmit({ kind: 'normal', title: trimmedCustom })
    } else {
      onSubmit({ kind: 'custom', title: trimmedSpecial })
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('newVolumeDialog.title')}
      size="sm"
      ariaLabel={t('newVolumeDialog.title')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('cancel')}
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={submit}>
            {tCommon('confirm')}
          </Button>
        </>
      }
    >
      <div className="new-volume-dialog">
        <Segmented
          size="sm"
          className="wf-seg--fill"
          aria-label={t('newVolumeDialog.typeAria')}
          value={mode}
          onChange={(value) => setMode(value as Mode)}
          options={[
            { value: 'normal', label: t('newVolumeDialog.normal') },
            { value: 'custom', label: t('newVolumeDialog.custom') }
          ]}
        />
        {mode === 'normal' ? (
          <FormField
            label={t('newVolumeDialog.customNameLabel')}
            htmlFor="new-volume-custom"
            key="normal"
          >
            <Input
              ref={inputRef}
              id="new-volume-custom"
              value={customName}
              placeholder={t('newVolumeDialog.customNamePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setCustomName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </FormField>
        ) : (
          <FormField label={t('newVolumeDialog.nameLabel')} htmlFor="new-volume-special" required>
            <Input
              ref={inputRef}
              id="new-volume-special"
              value={specialName}
              placeholder={t('newVolumeDialog.namePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setSpecialName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
              }}
            />
          </FormField>
        )}
      </div>
    </Modal>
  )
}
