import { useTranslation } from 'react-i18next'
import { useTooltip } from '../../components/ui'
import { useActivityPinned } from '../activityPinned'

/** 图钉双图标（对齐 template/index.html L1254–1265，stroke-width 1.9）。 */
function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 17v5" />
      <path d="M9 10.76V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4.76" />
      <path d="M8 10h8v4a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" />
    </svg>
  )
}

/**
 * 状态栏图钉按钮（`.st-side-btn`）：切换活动栏悬浮 / 固定两态。
 *
 * - 两态真源为 ActivityPinnedProvider（`body.act-pinned` 由其投影），
 *   活动栏视图与本按钮共享同一 context；
 * - `data-state` 驱动双图标显隐与激活外观（样式见 statusbar-widgets.css）。
 */
export default function PinButton() {
  const { t } = useTranslation('status')
  const { pinned, setPinned } = useActivityPinned()

  const title = pinned ? t('unpinBar') : t('pinBar')

  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLButtonElement>({
    content: title,
    placement: 'top'
  })

  return (
    <>
      {tooltip}
      <button
        ref={anchorRef}
        type="button"
        className="st-side-btn"
        data-state={pinned ? 'pinned' : 'float'}
        aria-label={title}
        aria-pressed={pinned}
        aria-describedby={anchorProps['aria-describedby']}
        onMouseEnter={anchorProps.onMouseEnter}
        onMouseLeave={anchorProps.onMouseLeave}
        onFocus={anchorProps.onFocus}
        onBlur={anchorProps.onBlur}
        onClick={() => setPinned(!pinned)}
      >
        <PinIcon />
        <PinIcon />
      </button>
    </>
  )
}
