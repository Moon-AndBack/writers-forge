import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../../components/ui'
import type { AiError } from '../../../../../../preload/types/ai'
import { AI_ERROR_TEXT_KEYS } from './aiErrorText'
import { ContextMeter } from './ContextMeter'
import type { ContextUsage } from './contextBudget'

export interface AiComposerStatusProps {
  /** 模型列表加载 / 刷新失败（null = 无错误）。 */
  error: AiError | null
  /** 错误行的重试按钮是否处于加载态。 */
  errorLoading: boolean
  /** 重试拉取模型列表。 */
  onRefresh: () => void
  /** 模型加载中 / 列表为空的行内提示（无则 null）。 */
  modelHint: string | null
  /** 上下文携带提示（已翻译；现有 carryHint 等）。 */
  hint: string | null
  /** 上下文占用（null = 不显示，如面板未激活）。 */
  usage: ContextUsage | null
}

/**
 * AI 输入区下方的状态行：模型错误（可重试）/ 模型提示 / 上下文提示 / 占用条。
 *
 * 从 `AiPanel` 抽出（单文件 500 行硬约束，AGENTS §3；也是第 3 步压缩逻辑的前置拆分）。
 * 渲染顺序与抽出前一致：错误 → 模型提示 → 上下文提示 → 占用条（新增，居末）。
 * `error` / `modelHint` 为结构化入参，翻译在本组件内完成；`hint` 由调用方算好（含字数插值）。
 */
export function AiComposerStatus({
  error,
  errorLoading,
  onRefresh,
  modelHint,
  hint,
  usage
}: AiComposerStatusProps): ReactElement {
  const { t } = useTranslation('ai')

  return (
    <>
      {error !== null ? (
        <div className="ai-panel__error" role="alert">
          <span>{t('panel.model.failed', { message: t(AI_ERROR_TEXT_KEYS[error.code]) })}</span>
          <Button size="sm" variant="ghost" loading={errorLoading} onClick={onRefresh}>
            {t('panel.model.refresh')}
          </Button>
        </div>
      ) : null}
      {modelHint !== null ? <div className="ai-panel__hint">{modelHint}</div> : null}
      <div className="ai-panel__hint">{hint}</div>
      {usage !== null ? <ContextMeter usage={usage} /> : null}
    </>
  )
}

export default AiComposerStatus
