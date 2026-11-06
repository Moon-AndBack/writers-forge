import { useTranslation } from 'react-i18next'
import { Modal } from '../../components/ui'
import AiSection from './AiSection'
import AppearanceSection from './AppearanceSection'
import CategoriesSection from './CategoriesSection'
import DataSection from './DataSection'
import GeneralSection from './GeneralSection'
import OneDriveSection from './OneDriveSection'
import '../../styles/settings.css'

export interface SettingsDialogProps {
  /** 是否打开。关闭时 `Modal` 返回 null，内容随之卸载。 */
  open: boolean
  /** 关闭回调（遮罩 / Esc / 头部关闭按钮触发）。 */
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
 * - 宽度用 `size="xl"`（880px，`.wf-window--xl`）；
 * - **不放** `.settings-page` / `.settings-main` 两层容器：滚动统一交给
 *   `.wf-window__body`（`flex:1; min-height:0; overflow-y:auto`），避免嵌套滚动条；
 * - 不传 `footer`：关闭入口在 `Window` 头部（`showClose` 默认 true）；
 * - 遮罩用 `wf-modal__mask--strong` 加强磨砂（`blur(10px) saturate(120%)`）。
 */
export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { t } = useTranslation('titlebar')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings')}
      ariaLabel={t('settings')}
      size="xl"
      panelClassName="wf-settings-modal"
      maskClassName="wf-modal__mask--strong"
      coverTitlebar={false}
    >
      <div className="settings-container">
        <GeneralSection />
        <AppearanceSection />
        <AiSection />
        <CategoriesSection />
        <DataSection />
        <OneDriveSection />
      </div>
    </Modal>
  )
}
