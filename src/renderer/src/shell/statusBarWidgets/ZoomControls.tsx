import { useTranslation } from 'react-i18next'
import { useTooltip } from '../../components/ui'
import { ZOOM_OPTIONS, useTypography } from './typographyContext'

/**
 * 状态栏缩放控件（`.st-zoom`）：− / 当前百分比 / +。
 *
 * 档位沿原型 §10（0.8–2.0 九档），± 在档位表上移动并夹取边界；
 * 变更经 useTypography().setTypography 写入 `--doc-zoom` 并防抖持久化。
 */
export default function ZoomControls() {
  const { t } = useTranslation('status')
  const { typography, setTypography } = useTypography()

  const index = ZOOM_OPTIONS.indexOf(Number(typography.zoom))
  const clamped = index < 0 ? ZOOM_OPTIONS.indexOf(1) : index
  const canZoomOut = clamped > 0
  const canZoomIn = clamped < ZOOM_OPTIONS.length - 1

  const {
    anchorRef: zoomOutRef,
    anchorProps: zoomOutProps,
    tooltip: zoomOutTooltip
  } = useTooltip<HTMLButtonElement>({ content: t('zoomOut'), placement: 'top' })
  const {
    anchorRef: zoomInRef,
    anchorProps: zoomInProps,
    tooltip: zoomInTooltip
  } = useTooltip<HTMLButtonElement>({ content: t('zoomIn'), placement: 'top' })

  const step = (delta: number): void => {
    const next = ZOOM_OPTIONS[Math.min(Math.max(clamped + delta, 0), ZOOM_OPTIONS.length - 1)]
    setTypography({ zoom: String(next) })
  }

  return (
    <div className="st-zoom">
      {zoomOutTooltip}
      {zoomInTooltip}
      <button
        ref={zoomOutRef}
        type="button"
        className="st-zoom-btn"
        disabled={!canZoomOut}
        aria-label={t('zoomOut')}
        aria-describedby={zoomOutProps['aria-describedby']}
        onMouseEnter={zoomOutProps.onMouseEnter}
        onMouseLeave={zoomOutProps.onMouseLeave}
        onFocus={zoomOutProps.onFocus}
        onBlur={zoomOutProps.onBlur}
        onClick={() => step(-1)}
      >
        −
      </button>
      <span className="st-zoom-val">{Math.round(Number(typography.zoom) * 100)}%</span>
      <button
        ref={zoomInRef}
        type="button"
        className="st-zoom-btn"
        disabled={!canZoomIn}
        aria-label={t('zoomIn')}
        aria-describedby={zoomInProps['aria-describedby']}
        onMouseEnter={zoomInProps.onMouseEnter}
        onMouseLeave={zoomInProps.onMouseLeave}
        onFocus={zoomInProps.onFocus}
        onBlur={zoomInProps.onBlur}
        onClick={() => step(1)}
      >
        +
      </button>
    </div>
  )
}
