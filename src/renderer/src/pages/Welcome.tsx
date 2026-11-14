import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/lib/log'
import { Button, Window } from '../components/ui'
import PenNameStep from './welcome/PenNameStep'
import '../styles/welcome.css'

/** 欢迎引导页日志（转发至主进程落盘）。 */
const log = createLogger('Welcome')

export interface WelcomeProps {
  /** 引导完成回调（由 App 切换到主内容）。 */
  onFinish: () => void
}

/**
 * 首次启动欢迎页（渲染在外壳 `.app-viewport` 内，标题栏 / 状态栏由外壳保留）。
 * 仅一步：填写笔名 → 落库并回调 `onFinish`。
 * 主题与窗口材质均由各自默认值生效（跟随系统 + 亚克力），引导不再干预。
 * 卡片复用组件库窗口框架 `Window`，与 `Modal` 保持同一外观。
 */
export default function Welcome({ onFinish }: WelcomeProps) {
  const { t } = useTranslation('welcome')
  const [penName, setPenName] = useState('')
  const [showError, setShowError] = useState(false)
  const [saving, setSaving] = useState(false)

  const trimmedName = penName.trim()
  const canFinish = trimmedName.length > 0

  const handleNameChange = useCallback((value: string) => {
    setPenName(value)
    if (value.trim().length > 0) setShowError(false)
  }, [])

  const finish = useCallback(async () => {
    if (saving) return
    // 笔名去空白后非空方可确认。
    if (!canFinish) {
      setShowError(true)
      return
    }
    setSaving(true)
    try {
      await window.api?.settings.set('penName', trimmedName)
      await window.api?.settings.set('onboardingCompleted', 'true')
    } catch (error) {
      // 持久化失败不阻塞进入主内容；下次启动仍会回到欢迎页。
      log.error('保存引导设置失败', error)
    }
    onFinish()
  }, [saving, canFinish, trimmedName, onFinish])

  return (
    <div className="wf-welcome">
      <Window
        className="wf-welcome__card"
        aria-labelledby="wf-welcome-title"
        title={
          /* 顶部固定区：标题 + 说明贴卡片顶部，不参与垂直居中 */
          <div className="wf-welcome__intro">
            <h1 className="wf-welcome__title" id="wf-welcome-title">
              {t('title')}
            </h1>
            <p className="wf-welcome__desc">{t('desc')}</p>
          </div>
        }
        bodyClassName="wf-welcome__content"
        footer={
          <>
            <span className="wf-welcome__spacer" />
            <Button
              variant="primary"
              className="wf-welcome__action"
              loading={saving}
              disabled={saving || !canFinish}
              onClick={() => void finish()}
            >
              {t('start')}
            </Button>
          </>
        }
      >
        <PenNameStep
          value={penName}
          onChange={handleNameChange}
          onSubmit={() => void finish()}
          showError={showError}
          disabled={saving}
        />
      </Window>
    </div>
  )
}
