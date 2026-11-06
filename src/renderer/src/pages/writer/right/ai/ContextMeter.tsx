import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTokenCount, type ContextUsage } from './contextBudget'

/** 警示阈值：占用达到 80% 后进度条转警示色（第 3 步起同时触发自动压缩）。 */
const WARN_RATIO = 0.8

type MeterTone = 'normal' | 'warn' | 'danger'

function resolveTone(ratio: number): MeterTone {
  if (ratio >= 1) return 'danger'
  if (ratio >= WARN_RATIO) return 'warn'
  return 'normal'
}

/**
 * 上下文占用条：`上下文 12.4K / 128K（10%）` + 进度条 + 来源说明。
 *
 * 纯展示（第 2 步）：不改发送、不做压缩 / 拒绝。
 * 已知事项：`limitSource === 'default'` 注明「未知模型 · 按 32K 估算」；
 * `catalog` 匹配时悬停可见命中 id。
 * 样式只用颜色 / 描边变化（AGENTS §8，无 transform、无位移动画）。
 */
export function ContextMeter({ usage }: { usage: ContextUsage }): ReactElement {
  const { t } = useTranslation('ai')

  const percent = Math.round(usage.ratio * 100)
  const tone = resolveTone(usage.ratio)
  const label = t('panel.context.label')

  return (
    <div className="ai-context" data-tone={tone}>
      <div className="ai-context__head">
        <span className="ai-context__label">{label}</span>
        <span className="ai-context__value">
          {t('panel.context.summary', {
            used: formatTokenCount(usage.usedTokens),
            limit: formatTokenCount(usage.limitTokens),
            percent: t('panel.context.percent', { ratio: percent })
          })}
        </span>
      </div>
      <div
        className="ai-context__bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        aria-valuetext={t('panel.context.percent', { ratio: percent })}
      >
        <span
          className="ai-context__fill"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {usage.limitSource === 'default' ? (
        <div className="ai-context__note">
          {t('panel.context.unknownModel', { tokens: formatTokenCount(usage.limitTokens) })}
        </div>
      ) : usage.limitSource === 'catalog' && usage.matchedId !== null ? (
        <div
          className="ai-context__note"
          title={t('panel.context.matchedFrom', { id: usage.matchedId })}
        >
          {t('panel.context.matchedFrom', { id: usage.matchedId })}
        </div>
      ) : null}
      {usage.calibrated ? (
        <div className="ai-context__note">{t('panel.context.calibrated')}</div>
      ) : null}
    </div>
  )
}

export default ContextMeter
