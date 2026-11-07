import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, IconButton, Tag, useTooltip } from '../../../../components/ui'
import type { AiError } from '../../../../../../preload/types/ai'
import type { AiContextNotice } from './chatRuntime'
import { AI_ERROR_TEXT_KEYS } from './aiErrorText'
import { formatTokenCount, type ContextUsage } from './contextBudget'

/** 警示阈值：占用达到 80% 后转警示色（与自动压缩阈值同口径）。 */
const WARN_RATIO = 0.8

type UsageTone = 'normal' | 'warn' | 'danger'

function resolveTone(ratio: number): UsageTone {
  if (ratio >= 1) return 'danger'
  if (ratio >= WARN_RATIO) return 'warn'
  return 'normal'
}

/**
 * 单行状态槽的文案与语义。
 *
 * 错误 / 超预算 / 整理中 / 模型提示四者**互斥**共用这一格，优先级见组件内注释。
 */
interface StatusMessage {
  text: string
  tone: 'danger' | 'mute'
  role: 'alert' | 'status'
  /** 悬停 / 聚焦时的完整说明（null = 文案本身已完整，不必再浮层）。 */
  tooltip: string | null
}

/** 刷新图标（随 currentColor 着色，尺寸由 IconButton sm 固定为 14px）。 */
function RefreshIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89" />
      <path d="M13.5 2.5V6H10" />
    </svg>
  )
}

export interface AiComposerStatusProps {
  /** 模型列表加载 / 刷新失败（null = 无错误）。 */
  error: AiError | null
  /** 模型列表请求是否在途（刷新按钮禁用态）。 */
  errorLoading: boolean
  /** 重试拉取模型列表。 */
  onRefresh: () => void
  /** 模型加载中 / 列表为空的行内提示（无则 null）。 */
  modelHint: string | null
  /** 上下文携带提示（已翻译；已选字数 / 全文 / 未选中 / 未携带）。 */
  hint: string
  /** 上下文占用（null = 不显示，如面板未激活）。 */
  usage: ContextUsage | null
  /** 是否正在整理上下文（摘要 / 截断）。 */
  compressing: boolean
  /** 上次发送因超预算被拒（null = 无）。 */
  notice: AiContextNotice | null
}

/**
 * AI 输入区下方的**单行**状态栏（原多行块已压缩为一行）。
 *
 * 从左到右：字数（Tag）· 状态信息（错误 / 超预算 / 整理中 / 模型提示，互斥）·
 * 上下文百分比（Badge）· 模型列表刷新按钮（IconButton）。
 *
 * 设计口径：
 * - 状态信息过长时单行省略，完整内容走自绘 Tooltip（`useTooltip`）；键盘可聚焦查看；
 * - 百分比只显示数字，悬停给出「已用 / 上限 + 来源 / 校准」完整说明；
 * - ≥80% 除换色外另加 `⚠` 前缀，不单靠颜色传递信息（a11y）；
 * - 刷新按钮常驻（ghost 小图标），不再只在错误时出现；
 * - 视觉只用颜色 / 描边，无 transform（AGENTS §8）。
 *
 * 从 `AiPanel` 抽出（单文件 500 行硬约束，AGENTS §3）；props 口径保持不变。
 */
export function AiComposerStatus({
  error,
  errorLoading,
  onRefresh,
  modelHint,
  hint,
  usage,
  compressing,
  notice
}: AiComposerStatusProps): ReactElement {
  const { t } = useTranslation('ai')

  /* ---------- 状态槽：四态互斥，按紧急程度择一 ----------
     超预算（发送被拒、需换模型 / 减内容）> 模型列表失败（影响选模型）>
     整理中（发送前阻塞）> 模型加载 / 空列表提示（背景性信息）。 */
  const overBudgetText =
    notice === null
      ? ''
      : t('panel.context.overBudget', {
          used: formatTokenCount(notice.usedTokens),
          limit: formatTokenCount(notice.limitTokens)
        })

  let message: StatusMessage | null = null
  if (notice !== null) {
    message = {
      text: overBudgetText,
      tone: 'danger',
      role: 'alert',
      tooltip: `${overBudgetText} ${t('panel.context.overBudgetHint')}`
    }
  } else if (error !== null) {
    const text = t('panel.model.failed', { message: t(AI_ERROR_TEXT_KEYS[error.code]) })
    message = { text, tone: 'danger', role: 'alert', tooltip: text }
  } else if (compressing) {
    message = {
      text: t('panel.context.compressing'),
      tone: 'mute',
      role: 'status',
      tooltip: null
    }
  } else if (modelHint !== null) {
    message = { text: modelHint, tone: 'mute', role: 'status', tooltip: null }
  }

  /* ---------- 上下文百分比 ---------- */
  let percent = 0
  let tone: UsageTone = 'normal'
  let summaryText = ''
  const notes: string[] = []
  if (usage !== null) {
    percent = Math.round(usage.ratio * 100)
    tone = resolveTone(usage.ratio)
    summaryText = t('panel.context.summary', {
      used: formatTokenCount(usage.usedTokens),
      limit: formatTokenCount(usage.limitTokens),
      percent: t('panel.context.percent', { ratio: percent })
    })
    if (usage.limitSource === 'default') {
      notes.push(t('panel.context.unknownModel', { tokens: formatTokenCount(usage.limitTokens) }))
    } else if (usage.limitSource === 'provider') {
      notes.push(t('panel.context.providerReported'))
    } else if (usage.limitSource === 'catalog' && usage.matchedId !== null) {
      notes.push(t('panel.context.matchedFrom', { id: usage.matchedId }))
    }
    if (usage.calibrated) notes.push(t('panel.context.calibrated'))
    if (tone === 'warn') notes.push(t('panel.context.nearLimit'))
    if (tone === 'danger') notes.push(t('panel.context.overLimit'))
  }
  const percentText = t('panel.context.percent', { ratio: percent })
  const usageLabel = [t('panel.context.label'), summaryText].join(' ')
  const usageTooltip = usage === null ? '' : [usageLabel, ...notes].join(' · ')
  const badgeTone = tone === 'normal' ? 'neutral' : tone

  /* ---------- Tooltip 锚点（文案为空时不渲染浮层） ---------- */
  const {
    anchorRef: messageAnchor,
    anchorProps: messageAnchorProps,
    tooltip: messageTooltip
  } = useTooltip<HTMLSpanElement>({
    content: message?.tooltip ?? '',
    placement: 'top'
  })
  const {
    anchorRef: usageAnchor,
    anchorProps: usageAnchorProps,
    tooltip: usageTooltipNode
  } = useTooltip<HTMLSpanElement>({
    content: usageTooltip,
    placement: 'top'
  })

  return (
    <div className="ai-composer-status">
      {hint !== '' ? <Tag className="ai-composer-status__chars">{hint}</Tag> : null}

      {message !== null ? (
        <>
          {messageTooltip}
          <span
            ref={messageAnchor}
            {...messageAnchorProps}
            className="ai-composer-status__message"
            data-tone={message.tone}
            role={message.role}
            tabIndex={message.tooltip !== null ? 0 : undefined}
          >
            {message.text}
          </span>
        </>
      ) : null}

      <span className="ai-composer-status__right">
        {usage !== null ? (
          <>
            {usageTooltipNode}
            <span ref={usageAnchor} {...usageAnchorProps} className="ai-composer-status__usage">
              <Badge tone={badgeTone} aria-label={usageTooltip}>
                {tone === 'normal' ? null : <span aria-hidden="true">{'⚠ '}</span>}
                {percentText}
              </Badge>
            </span>
          </>
        ) : null}
        <IconButton
          size="sm"
          variant="ghost"
          label={t('panel.model.refreshAria')}
          tooltipPlacement="top"
          disabled={errorLoading}
          aria-busy={errorLoading || undefined}
          onClick={onRefresh}
        >
          <RefreshIcon />
        </IconButton>
      </span>
    </div>
  )
}

export default AiComposerStatus
