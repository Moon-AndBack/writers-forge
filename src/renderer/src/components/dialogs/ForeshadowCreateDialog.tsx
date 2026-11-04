import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ForeshadowAnchor } from '../../../../main/database/foreshadows'
import { Button, FormField, Input, Modal, Textarea } from '../ui'
import '../../styles/components/foreshadow-create-dialog.css'

export interface ForeshadowCreateDialogProps {
  /** 书籍 id（`foreshadow.create` 的所属书，锚点目标须同书）。 */
  bookId: string
  /** 右键快照构造出的锚点（章节 / 大纲条目 / 未锚定）。 */
  anchor: ForeshadowAnchor
  /** 名称可选初值（正文右键场景传空串：名称一律由用户自行输入）。 */
  defaultTitle: string
  /** 关联位置展示串（如「第一卷 · 第三章」）；空串 → 展示「未关联」。 */
  contextLabel: string
  /** 选中文字快照（即锚点 `quote`）；空串 → 展示占位。 */
  selectedText: string
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /**
   * 创建成功（由父级负责 toast + 关闭）。
   * 提示不能留在弹窗内部：成功后弹窗卸载，挂在弹窗内的 toast 节点会随之消失。
   */
  onCreated: () => void
  /** 创建失败（由父级 toast；弹窗保持打开，输入得以保留可重试）。 */
  onFailed: () => void
}

/**
 * 「新建伏笔」弹窗（右键「添加伏笔」入口）。
 *
 * - 字段顺序：名称（必填，用户输入）/ 关联（只读）/ 选中文字（只读）/ 描述（可选多行）；
 *   状态固定为 `planted`（本批只做埋设入口）；
 * - 提交直接调 `window.api.foreshadow.create`：成功 → `onCreated`；返回 null / 抛错 →
 *   `onFailed`，**不关闭**弹窗；
 * - 文案全部走 `foreshadow` ns；按钮 `onMouseDown` 阻止默认，与编辑器菜单同口径
 *   （弹窗打开时选区已快照，不夺焦以免破坏编辑器选区语义）。
 */
export default function ForeshadowCreateDialog({
  bookId,
  anchor,
  defaultTitle,
  contextLabel,
  selectedText,
  onClose,
  onCreated,
  onFailed
}: ForeshadowCreateDialogProps) {
  const { t } = useTranslation('foreshadow')
  const [title, setTitle] = useState(defaultTitle)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回名称输入框。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const trimmedTitle = title.trim()
  const canSubmit = trimmedTitle !== '' && !submitting

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const row = await window.api.foreshadow.create(bookId, {
        title: trimmedTitle,
        description: description.trim(),
        status: 'planted',
        anchor
      })
      if (row === null) {
        onFailed()
        setSubmitting(false)
        return
      }
      onCreated()
    } catch {
      onFailed()
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dialog.createTitle')}
      size="sm"
      ariaLabel={t('dialog.createTitle')}
      footer={
        <>
          <Button variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void submit()}
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="foreshadow-create-dialog">
        <FormField label={t('field.name')} htmlFor="foreshadow-create-name" required>
          <Input
            ref={inputRef}
            id="foreshadow-create-name"
            value={title}
            placeholder={t('field.namePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </FormField>
        <FormField label={t('field.context')} htmlFor="foreshadow-create-context">
          <Input
            id="foreshadow-create-context"
            readOnly
            tabIndex={-1}
            value={contextLabel === '' ? t('field.contextUnlinked') : contextLabel}
            spellCheck={false}
          />
        </FormField>
        <FormField label={t('field.selectedText')} htmlFor="foreshadow-create-selected-text">
          <Textarea
            id="foreshadow-create-selected-text"
            rows={2}
            readOnly
            tabIndex={-1}
            value={selectedText}
            placeholder={t('field.selectedTextEmpty')}
          />
        </FormField>
        <FormField label={t('field.description')} htmlFor="foreshadow-create-description">
          <Textarea
            id="foreshadow-create-description"
            rows={4}
            value={description}
            placeholder={t('field.descriptionPlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  )
}
