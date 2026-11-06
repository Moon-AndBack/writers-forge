/**
 * 设置页 · AI 分区「模型目录」行（展示组件）。
 *
 * 只负责展示目录状态与刷新入口：条数 / 上次更新时间 / 是否过期。
 * 目录用于上下文窗口估算与自动压缩；刷新成功后清空渲染层窗口缓存，
 * 已打开的 AI 面板会重新向主进程解析窗口值。
 */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import type { AiCatalogMeta, AiError } from '../../../../preload/types/ai'
import { invalidateLimitCache } from '../writer/right/ai/useContextUsage'
import SettingRow from './SettingRow'
import { ERROR_KEYS, UNKNOWN_ERROR } from './aiSectionSupport'

type CatalogState =
  | { status: 'loading' }
  | { status: 'idle' }
  | { status: 'ready'; count: number; fetchedAt: number; stale: boolean }
  | { status: 'error'; error: AiError; count?: number; fetchedAt?: number; stale?: boolean }

/** 缓存时间戳 → 本地可读时间（仅展示，不参与业务判断）。 */
function formatTime(value: number): string {
  return new Date(value).toLocaleString()
}

export function AiCatalogRow() {
  const { t } = useTranslation('ai')
  const [state, setState] = useState<CatalogState>({ status: 'idle' })

  /** 目录元信息 → 状态：`ok` 优先展示条数；失败时尽量保留旧缓存元信息。 */
  const applyMeta = useCallback((meta: AiCatalogMeta): void => {
    if (meta.ok && typeof meta.count === 'number' && typeof meta.fetchedAt === 'number') {
      setState({
        status: 'ready',
        count: meta.count,
        fetchedAt: meta.fetchedAt,
        stale: meta.stale === true
      })
      return
    }
    if (meta.error) {
      setState({
        status: 'error',
        error: meta.error,
        ...(typeof meta.count === 'number' ? { count: meta.count } : {}),
        ...(typeof meta.fetchedAt === 'number' ? { fetchedAt: meta.fetchedAt } : {}),
        ...(meta.stale !== undefined ? { stale: meta.stale } : {})
      })
      return
    }
    setState({ status: 'idle' })
  }, [])

  // 挂载时只读缓存元信息，不联网。
  useEffect(() => {
    const api = window.api?.ai
    if (!api) return undefined
    let active = true
    api.catalog
      .get('cache')
      .then((meta) => {
        if (active) applyMeta(meta)
      })
      .catch(() => {
        if (active) setState({ status: 'idle' })
      })
    return () => {
      active = false
    }
  }, [applyMeta])

  const handleRefresh = (): void => {
    const api = window.api?.ai
    if (!api) return
    setState({ status: 'loading' })
    void api.catalog
      .get('refresh')
      .then((meta) => {
        // 目录变了 → 所有模型的窗口可能重算；清空渲染层缓存，占用条与压缩判定同步更新。
        if (meta.ok) invalidateLimitCache()
        applyMeta(meta)
      })
      .catch(() => setState({ status: 'error', error: UNKNOWN_ERROR }))
  }

  return (
    <SettingRow
      label={t('catalog.label')}
      description={
        <>
          {t('catalog.description')}
          {state.status === 'loading' ? (
            <span className="ai-status">{t('catalog.loading')}</span>
          ) : null}
          {state.status === 'idle' ? <span className="ai-status">{t('catalog.idle')}</span> : null}
          {state.status === 'ready' ? (
            <>
              <span className="ai-status">
                {t('catalog.summary', { count: state.count })} ·{' '}
                {t('catalog.updatedAt', { time: formatTime(state.fetchedAt) })}
              </span>
              {state.stale ? (
                <span className="ai-status ai-status--warn">{t('catalog.stale')}</span>
              ) : null}
            </>
          ) : null}
          {state.status === 'error' ? (
            <>
              <span className="ai-status ai-status--error" role="alert">
                {t('catalog.failed', { message: t(ERROR_KEYS[state.error.code]) })}
              </span>
              {typeof state.count === 'number' && typeof state.fetchedAt === 'number' ? (
                <span className="ai-status">
                  {t('catalog.summary', { count: state.count })} ·{' '}
                  {t('catalog.updatedAt', { time: formatTime(state.fetchedAt) })}
                </span>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      <div className="ai-control">
        <Button
          size="sm"
          variant="ghost"
          loading={state.status === 'loading'}
          onClick={handleRefresh}
        >
          {t('catalog.refresh')}
        </Button>
      </div>
    </SettingRow>
  )
}

AiCatalogRow.displayName = 'AiCatalogRow'

export default AiCatalogRow
