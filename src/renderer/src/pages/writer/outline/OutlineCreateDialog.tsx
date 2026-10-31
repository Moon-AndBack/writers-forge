import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input, Modal, Segmented } from '../../../components/ui'

export interface OutlineCreateDialogProps {
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 提交正文卷：`title` 可空（留空由后端自动编号「卷X」）。 */
  onCreateVolume: (title: string) => void
  /** 提交条目：`title` 可空（空名条目，创建后由页面层选中新行）。 */
  onCreateEntry: (title: string) => void
  /** 提交分组容器：`title` 可空（空名分组，创建后由页面层选中新行）。 */
  onCreateGroup: (title: string) => void
}

type Mode = 'entry' | 'group' | 'volume'

/**
 * 大纲「新建」弹窗（单弹窗机制，与章节「新建卷」弹窗同范式）：
 * 顶部 Segmented 三选一形态（条目 / 分组 / 正文卷）+ 单个名称输入。
 * - **大纲没有「自定义卷」**：正文卷形态对应共享卷源 `createVolume({ kind:'normal', title })`；
 * - 名称均可空：条目 / 分组 / 卷留空走默认名 / 自动编号；
 * - Enter 提交，Esc / 遮罩关闭（Modal 内建）。
 */
export default function OutlineCreateDialog({
  onClose,
  onCreateVolume,
  onCreateEntry,
  onCreateGroup
}: OutlineCreateDialogProps) {
  const { t } = useTranslation('outline')
  const { t: tCommon } = useTranslation('common')
  const [mode, setMode] = useState<Mode>('entry')
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回输入框（与 NewVolumeDialog 一致）。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  // 名称可空（条目 / 分组 / 卷均允许空 → 走默认名 / 自动编号），恒可提交。
  const canSubmit = true

  const submit = (): void => {
    const trimmed = name.trim()
    if (mode === 'entry') onCreateEntry(trimmed)
    else if (mode === 'group') onCreateGroup(trimmed)
    else onCreateVolume(trimmed)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('add')}
      size="sm"
      ariaLabel={t('add')}
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
      <div className="outline-create-dialog">
        <Segmented
          size="sm"
          className="wf-seg--fill"
          aria-label={t('createDialog.typeAria')}
          value={mode}
          onChange={(value) => setMode(value as Mode)}
          options={[
            { value: 'entry', label: t('newNonVolumeChapter') },
            { value: 'group', label: t('newGroup') },
            { value: 'volume', label: t('newVolume') }
          ]}
        />
        <FormField label={t('createDialog.nameLabel')} htmlFor="outline-create-name">
          <Input
            ref={inputRef}
            id="outline-create-name"
            value={name}
            placeholder={t('createDialog.namePlaceholder')}
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
      </div>
    </Modal>
  )
}
