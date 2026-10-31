import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../components/ui'

export interface ConfirmDialogProps {
  /** 是否显示。 */
  open: boolean
  /** 标题（简短动作名，如「删除章节」）。 */
  title: string
  /** 正文说明（危险操作请写明后果）。 */
  message?: ReactNode
  /** 确认按钮文案，默认取 `common.confirm`（随语言切换）。 */
  confirmText?: string
  /** 取消按钮文案，默认取 `common.cancel`（随语言切换）。 */
  cancelText?: string
  /** 确认按钮色调：danger 呈危险色，默认 danger。 */
  tone?: 'danger' | 'default'
  /** 确认中：禁用两个按钮，避免重复提交。 */
  confirming?: boolean
  /** 点击确认（由调用方执行 + 关闭）。 */
  onConfirm: () => void
  /** 关闭（取消 / Esc / 遮罩）。 */
  onClose: () => void
}

/**
 * 通用确认弹窗：复用 `Modal`（Window 外框 + 遮罩 + Esc）与 `Button`，
 * 用于删除 / 彻底删除 / 清空回收站等需要二次确认的破坏性操作。
 * 纯受控：确认后是否关闭由调用方的 `onConfirm` 决定。
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  tone = 'danger',
  confirming = false,
  onConfirm,
  onClose
}: ConfirmDialogProps) {
  const { t } = useTranslation('common')
  // 默认文案走 i18n（hook 不能放在参数默认值里，故在函数体内兜底）。
  const resolvedConfirmText = confirmText ?? t('confirm')
  const resolvedCancelText = cancelText ?? t('cancel')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      ariaLabel={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={confirming}>
            {resolvedCancelText}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={confirming}
          >
            {resolvedConfirmText}
          </Button>
        </>
      }
    >
      <div className="confirm-msg">{message}</div>
    </Modal>
  )
}

export default ConfirmDialog
