import { Trans, useTranslation } from 'react-i18next'
import { SPEED_MIN_CHARS, useWritingSession } from '../writingSession'

/**
 * 状态栏「本次码字」胶囊：书架页与写作页共用（挂在外壳 `StatusBar` 内）。
 *
 * 数据来自 `shell/writingSession`（模块级 store）：首次出现正增量后才渲染，
 * 之后一直保留；净增字数为负时展示 0。不足 `SPEED_MIN_CHARS` 字只显示字数，
 * 避免「首字 → 天文时速」的误导。`title` 说明速度不含空闲时间。
 */
export default function WritingSessionStats() {
  const { t } = useTranslation('status')
  const { visible, chars, speed } = useWritingSession()

  if (!visible) return null

  const value = Math.max(0, chars)
  const showSpeed = value >= SPEED_MIN_CHARS && speed > 0

  return (
    <span className="st-item st-meta" title={t('writingSession.title')}>
      <Trans
        i18nKey={showSpeed ? 'writingSession.summary' : 'writingSession.charsOnly'}
        ns="status"
        values={{
          chars: value.toLocaleString('en-US'),
          speed: speed.toLocaleString('en-US')
        }}
        components={{ b: <b /> }}
      />
    </span>
  )
}
