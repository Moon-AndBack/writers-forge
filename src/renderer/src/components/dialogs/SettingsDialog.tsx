import { useTranslation } from 'react-i18next'
import AiSection from '../../pages/settings/AiSection'
import AppearanceSection from '../../pages/settings/AppearanceSection'
import CategoriesSection from '../../pages/settings/CategoriesSection'
import DataSection from '../../pages/settings/DataSection'
import GeneralSection from '../../pages/settings/GeneralSection'
import OneDriveSection from '../../pages/settings/OneDriveSection'
import { Modal } from '../ui'
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
 * 置于 `components/dialogs/` 而非 `pages/settings/`：调用方是外壳
 * `shell/TitleBar.tsx`（跨页面恒定），与 `NewVolumeDialog` 同属「任意页面可
 * 召唤」的浮层，符合 §9「通用组件优先、跨页面复用放共享层」。
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
