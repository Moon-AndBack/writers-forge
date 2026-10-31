import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../components/ui'
import './diagnostics.css'
import type { DiagnosticsReport } from './useDiagnostics'

export interface DiagnosticsDialogProps {
  /** 含问题的自检报告（`status === 'problems'` 且 `issues` 非空时才应传入）。 */
  report: DiagnosticsReport
  /** 关闭（关闭按钮 / 底栏按钮 / Esc / 遮罩）。 */
  onClose: () => void
}

/**
 * 启动后的「数据健康检查」弹窗：列出全部问题（结构不符 / 外键悬空 / 不变量破坏 / 文件损坏）。
 *
 * - **文案经 i18n 渲染**（AGENTS §10）：主进程只回传 `code` + `params`，
 *   此处以 `` t(`issue.${issue.code}.title`) `` / `.detail` 取模板并插值；
 * - **不自动消失**：无定时关闭，必须由用户主动关闭（这是数据健康警告）；
 * - 复用通用 `Modal`（含 Esc / 遮罩 / 关闭按钮），无需新交互设施。
 */
export function DiagnosticsDialog({ report, onClose }: DiagnosticsDialogProps) {
  const { t } = useTranslation('diagnostics')

  const checkedAt = new Date(report.checkedAt).toLocaleString()

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dialog.title')}
      size="lg"
      ariaLabel={t('dialog.title')}
      footer={
        <>
          <span className="diagnostics__footer-spacer" />
          <Button variant="primary" onClick={onClose}>
            {t('dialog.dismiss')}
          </Button>
        </>
      }
    >
      <div className="diagnostics">
        <p className="diagnostics__summary">{t('dialog.summary', { n: report.issues.length })}</p>
        <p className="diagnostics__meta">{t('dialog.checkedAt', { time: checkedAt })}</p>
        <p className="diagnostics__hint">{t('dialog.hint')}</p>

        <ul className="diagnostics__list">
          {report.issues.map((issue, index) => (
            <li key={`${issue.code}-${String(index)}`} className="diagnostics__item">
              <p className="diagnostics__item-title">
                {t(`issue.${issue.code}.title`, issue.params)}
              </p>
              <p className="diagnostics__item-detail">
                {t(`issue.${issue.code}.detail`, issue.params)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

export default DiagnosticsDialog
