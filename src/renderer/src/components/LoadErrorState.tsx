import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'
import { EmptyState } from './EmptyState'

export interface LoadErrorStateProps {
  /** 重试回调：重新发起该面板的数据读取。 */
  onRetry: () => void
  /** 紧凑变体（中栏 / 侧栏内使用）。 */
  compact?: boolean
  /** 追加类名，供调用方补充。 */
  className?: string
}

/**
 * 读取失败态：把「读取失败」与「真的是空数据」区分开，避免用户误以为内容丢失。
 *
 * - 结构与视觉复用 `EmptyState`（经 `className` 追加 `is-error` 修饰类，不改其接口）；
 * - 操作按钮复用 `components/ui` 的 `Button`，与项目现有按钮风格一致；
 * - 文案统一取 `common` ns（`loadFailedTitle` / `loadFailedDesc` / `retry`），各面板不再各写一套。
 */
export function LoadErrorState({
  onRetry,
  compact = false,
  className
}: LoadErrorStateProps): ReactElement {
  const { t } = useTranslation('common')
  const classes = ['is-error', className ?? null].filter(Boolean).join(' ')

  return (
    <EmptyState
      className={classes}
      compact={compact}
      role="alert"
      title={t('loadFailedTitle')}
      description={
        <>
          <span>{t('loadFailedDesc')}</span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </>
      }
    />
  )
}

export default LoadErrorState
