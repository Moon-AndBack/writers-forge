import type { TFunction } from 'i18next'
import type { CSSProperties, PointerEventHandler, TransitionEventHandler } from 'react'
import { useTranslation } from 'react-i18next'
import { LockIcon, UnlockIcon } from '../../components/icons'
import '../../styles/statusbar-writing-session.css'
import type { WritingSessionSnapshot } from '../writingSession'

export interface WritingSessionDetailProps {
  /** 弹层 DOM id（状态栏胶囊以 `aria-controls` 指向）。 */
  id: string
  /** 打开瞬间的实时快照（总时长 / 空闲时长已按打开时刻现算）。 */
  stats: WritingSessionSnapshot
  /** 是否锁定常驻（锁定时移出 / 点外部 / Esc 都不关闭）。 */
  locked: boolean
  /** 切换锁定状态（解锁后回到 hover 模式并复位位置）。 */
  onToggleLock: () => void
  /** 浮层根节点（父组件拖动 / 定位测量用）。 */
  elementRef: (node: HTMLDivElement | null) => void
  /** 锁定态的固定定位（视口坐标）；null = 跟随状态栏胶囊。 */
  position: { left: number; top: number } | null
  /** 是否正在拖动标题区（cursor: grabbing）。 */
  dragging: boolean
  /** 解锁复位动画进行中（仅此时给 left / top 挂过渡）。 */
  resetting: boolean
  /** 点按标题区：仅锁定态开始拖动，锁图标等按钮不参与。 */
  onDragPointerDown: PointerEventHandler<HTMLDivElement>
  onDragPointerMove: PointerEventHandler<HTMLDivElement>
  onDragPointerUp: PointerEventHandler<HTMLDivElement>
  /** 复位过渡结束（left / top），用于回落到绝对定位。 */
  onResetTransitionEnd: TransitionEventHandler<HTMLDivElement>
}

/** 时长格式化：`X 小时 Y 分` / `Y 分 Z 秒` / `Z 秒`（向下取整到秒）。 */
function formatDuration(ms: number, t: TFunction<'status'>): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return t('writingSession.hoursMinutes', { hours, minutes })
  if (minutes > 0) return t('writingSession.minutesSeconds', { minutes, seconds })
  return t('writingSession.seconds', { seconds })
}

/**
 * 「本次码字」详情浮层内容（状态栏胶囊的向上弹层，面板外壳由 `.st-popup` 提供）。
 *
 * 展示本次会话累计字数、速度、码字时长与空闲时长；右上角锁图标切换「常驻」。
 * 锁定后标题区成为拖动把手（父组件把浮层切到 `position: fixed`），解锁即复位。
 * 数据取打开时刻的 `getLiveSnapshot()`，不做常驻定时刷新；浮层内不重复计算速度。
 */
export default function WritingSessionDetail({
  id,
  stats,
  locked,
  onToggleLock,
  elementRef,
  position,
  dragging,
  resetting,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onResetTransitionEnd
}: WritingSessionDetailProps) {
  const { t } = useTranslation('status')
  const lockLabel = locked ? t('writingSession.unlock') : t('writingSession.lock')
  const style: CSSProperties | undefined =
    position === null
      ? undefined
      : {
          position: 'fixed',
          left: position.left,
          top: position.top,
          right: 'auto',
          bottom: 'auto'
        }

  return (
    <div
      ref={elementRef}
      id={id}
      className={`st-popup st-session-pop${locked ? ' is-locked' : ''}${
        dragging ? ' is-dragging' : ''
      }${resetting ? ' is-resetting' : ''}`}
      style={style}
      role="dialog"
      aria-label={t('writingSession.detailTitle')}
      onTransitionEnd={onResetTransitionEnd}
    >
      <div
        className="st-session-head"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
      >
        <span className="st-session-title">{t('writingSession.detailTitle')}</span>
        <button
          type="button"
          className="st-session-lock"
          aria-pressed={locked}
          aria-label={lockLabel}
          title={lockLabel}
          onClick={onToggleLock}
        >
          {locked ? <LockIcon /> : <UnlockIcon />}
        </button>
      </div>

      <div className="st-session-row">
        <span className="st-session-label">{t('writingSession.chars')}</span>
        <span className="st-session-value">
          {t('writingSession.charsValue', {
            chars: Math.max(0, stats.chars).toLocaleString('en-US')
          })}
        </span>
      </div>
      <div className="st-session-row">
        <span className="st-session-label">{t('writingSession.speed')}</span>
        <span className="st-session-value">
          {t('writingSession.speedValue', {
            speed: Math.max(0, stats.speed).toLocaleString('en-US')
          })}
        </span>
      </div>
      <div className="st-session-row">
        <span className="st-session-label">{t('writingSession.activeTime')}</span>
        <span className="st-session-value">{formatDuration(stats.activeMs, t)}</span>
      </div>
      <div className="st-session-row">
        <span className="st-session-label">{t('writingSession.idleTime')}</span>
        <span className="st-session-value">{formatDuration(stats.idleMs, t)}</span>
      </div>
    </div>
  )
}
