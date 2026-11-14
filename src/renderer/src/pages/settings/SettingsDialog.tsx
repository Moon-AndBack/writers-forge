import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal, useToast } from '../../components/ui'
import { useConfirm } from '../writer/chapters/useConfirm'
import AiSection from './AiSection'
import AppearanceSection from './AppearanceSection'
import CategoriesSection from './CategoriesSection'
import DataSection from './DataSection'
import GeneralSection from './GeneralSection'
import OneDriveSection from './OneDriveSection'
import SettingsNav, { type SettingsPageId } from './SettingsNav'
import { useResetSettings } from './useResetSettings'
import '../../styles/settings.css'

export interface SettingsDialogProps {
  /** 是否打开。关闭时 `Modal` 返回 null，内容随之卸载。 */
  open: boolean
  /** 关闭回调（遮罩 / Esc / 头部关闭按钮 / 底栏「关闭」触发）。 */
  onClose: () => void
}

/**
 * 设置弹窗（原独立路由 `/settings` 改为弹窗，入口为标题栏齿轮按钮）。
 *
 * 置于 `pages/settings/` 而非 `components/dialogs/`：本文件是「设置」功能的组装
 * 入口，六个分区及其实现细节同目录内聚；它不属于跨功能复用的通用浮层，
 * 调用方 `shell/TitleBar.tsx` 只负责唤起。与 `pages/bookshelf/BookFormDialog.tsx`
 * 等「功能自有弹窗跟随功能目录」的既有惯例一致（§2 页面 → 组件分层）。
 *
 * 结构要点：
 * - 宽度用 `size="xl"`（880px，`.wf-window--xl`）；高度固定在
 *   `min(680px, calc(100vh - 90px))`，切换分区不跳动，只有窗口尺寸变化才变；
 * - **两栏**：左侧 `SettingsNav`（五项，184px，`--soft-solid` 软底）+ 右侧内容区
 *   （`--pane`，无分隔线）；`window.css` 的 body 内衬在本弹窗覆写为 0，滚动交给
 *   右侧 `.settings-content` 单层承接；
 * - 六个分区**全部常驻渲染**，仅以 `.settings-panel.is-active` 切换 `display`
 *   （仿写作页 `SidePane` 的 `.sp-panel`）：切页不会卸载 AI 草稿 / API Key 输入 /
 *   测试结果、压缩窗口输入、分类重命名态、备份列表与 OneDrive 登录态；
 * - 底栏：左「重置为默认」（`variant="danger"`）、右「关闭」（默认 secondary），
 *   `justify-content: space-between` 自动分列；重置经 `ConfirmDialog` 二次确认
 *   （`tone="danger"`），只恢复五项界面偏好（见 `useResetSettings`）；
 * - 遮罩沿用全局 `Modal` 默认（`--overlay-mask` + blur(2px)），不再自定义加强磨砂。
 */
export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation('titlebar')
  const { t: tSettings } = useTranslation('settings')
  const { t: tCommon } = useTranslation('common')
  const [page, setPage] = useState<SettingsPageId>('general')
  const contentRef = useRef<HTMLDivElement | null>(null)
  const reset = useResetSettings()
  const confirm = useConfirm()
  const toast = useToast()

  // 切页后内容区回到顶部（渲染完成后执行，避免被新面板高度重新夹紧）。
  useEffect(() => {
    if (contentRef.current !== null) contentRef.current.scrollTop = 0
  }, [page])

  const pageClass = (id: SettingsPageId): string =>
    page === id ? 'settings-panel is-active' : 'settings-panel'

  const handleReset = (): void => {
    confirm.request(
      {
        title: tSettings('reset.confirmTitle'),
        message: tSettings('reset.confirmMessage'),
        confirmText: tSettings('reset.confirmAction'),
        tone: 'danger'
      },
      () => {
        reset()
        toast.show(tSettings('reset.doneToast'))
      }
    )
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('settings')}
        ariaLabel={t('settings')}
        size="xl"
        panelClassName="wf-settings-modal"
        coverTitlebar={false}
        footer={
          <>
            <Button variant="danger" onClick={handleReset}>
              {tSettings('reset.label')}
            </Button>
            <Button onClick={onClose}>{tCommon('close')}</Button>
          </>
        }
      >
        <div className="settings-shell">
          <SettingsNav active={page} onChange={setPage} />
          <div className="settings-content" ref={contentRef}>
            <div className={pageClass('general')}>
              <GeneralSection />
            </div>
            <div className={pageClass('appearance')}>
              <AppearanceSection />
            </div>
            <div className={pageClass('ai')}>
              <AiSection />
            </div>
            <div className={pageClass('categories')}>
              <CategoriesSection />
            </div>
            <div className={pageClass('data')}>
              <DataSection />
              <OneDriveSection />
            </div>
          </div>
        </div>
      </Modal>
      {confirm.node}
      {toast.node}
    </>
  )
}
