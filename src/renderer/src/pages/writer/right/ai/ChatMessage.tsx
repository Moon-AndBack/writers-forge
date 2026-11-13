import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button, Tag } from '../../../../components/ui'
import { AI_ERROR_TEXT_KEYS } from './aiErrorText'
import { ACTION_LABEL_KEYS } from './panelUtils'
import type { ApplyActions } from './panelUtils'
import type { AiConversationMessage } from './chatRuntime'

/**
 * Markdown 元素覆写：全部只挂类名（样式见 `styles/writer-ai.css`），
 * 不用内联样式（§8：颜色 / 字号统一由主题令牌控制）。
 * 覆写对象置于模块层，引用稳定，避免流式追加时每帧重建组件树。
 */
const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="ai-md-p">{children}</p>,
  h1: ({ children }) => <h1 className="ai-md-h">{children}</h1>,
  h2: ({ children }) => <h2 className="ai-md-h">{children}</h2>,
  h3: ({ children }) => <h3 className="ai-md-h">{children}</h3>,
  h4: ({ children }) => <h4 className="ai-md-h">{children}</h4>,
  ul: ({ children }) => <ul className="ai-md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="ai-md-ol">{children}</ol>,
  li: ({ children }) => <li className="ai-md-li">{children}</li>,
  pre: ({ children }) => <pre className="ai-md-pre">{children}</pre>,
  code: ({ className, children }) => (
    <code className={className ? `ai-md-code ai-md-code--block ${className}` : 'ai-md-code'}>
      {children}
    </code>
  ),
  table: ({ children }) => <table className="ai-md-table">{children}</table>,
  thead: ({ children }) => <thead className="ai-md-thead">{children}</thead>,
  tbody: ({ children }) => <tbody className="ai-md-tbody">{children}</tbody>,
  tr: ({ children }) => <tr className="ai-md-tr">{children}</tr>,
  th: ({ children }) => <th className="ai-md-th">{children}</th>,
  td: ({ children }) => <td className="ai-md-td">{children}</td>,
  blockquote: ({ children }) => <blockquote className="ai-md-quote">{children}</blockquote>,
  hr: () => <hr className="ai-md-hr" />,
  a: ({ children, href }) => (
    <a className="ai-md-a" href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="ai-md-strong">{children}</strong>,
  em: ({ children }) => <em className="ai-md-em">{children}</em>
}

/**
 * 可折叠长文本：默认按 3 行截断（CSS `-webkit-line-clamp`），实际溢出时才出现
 * 「展开 / 收起」。用 `scrollHeight` 与 `clientHeight` 比对判断是否截断，
 * 避免按字符数猜测（中英文 / 换行差异大）。
 */
function CollapsibleText({ text, className }: { text: string; className: string }) {
  const { t } = useTranslation('ai')
  const ref = useRef<HTMLParagraphElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (node === null || expanded) return
    setOverflowing(node.scrollHeight > node.clientHeight + 1)
  }, [text, expanded])

  return (
    <>
      <p ref={ref} className={`${className}${expanded ? '' : ' is-clamped'}`}>
        {text}
      </p>
      {overflowing ? (
        <button
          type="button"
          className="ai-msg__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {t(expanded ? 'message.collapse' : 'message.expand')}
        </button>
      ) : null}
    </>
  )
}

export interface ChatMessageProps {
  message: AiConversationMessage
  /**
   * 该消息允许的回插动作；`null` = 不可回插
   * （非 assistant / 流式 / 错误 / 中断 / 空正文 / 跨章）。
   */
  applyActions: ApplyActions | null
  /** 消息来自其它章（跨章会话）：assistant 气泡上加一条轻量来源提示。 */
  fromOtherChapter?: boolean
  onApplyReplace: (message: AiConversationMessage) => void
  onApplyInsert: (message: AiConversationMessage) => void
}

/**
 * 单条 AI 消息气泡（对话模式与快捷结果共用）。
 *
 * - user / assistant 靠对齐方向与底色区分（无 transform，§8）；
 * - user 气泡：功能胶囊 + 正文（输入或上下文兜底）+ 携带内容预览（分隔线后 3 行折叠）；
 * - assistant 走 `react-markdown` + `remark-gfm`（元素类名见 `MD_COMPONENTS`）；
 * - 流式中追加闪烁光标（只动 opacity）；错误走 `ai` ns 的 `error.<code>`；
 * - 回插按钮按 `applyActions` 渲染：润色 / 重写 / 翻译只替换，续写只插入，
 *   自由对话两个都给；历史消息（功能未知）只给插入，避免旧续写回复覆盖正文。
 *   插入按钮文案随 `insertAtEnd` 切换落点（携带全文 → 全文末尾）。
 */
export function ChatMessage({
  message,
  applyActions,
  fromOtherChapter = false,
  onApplyReplace,
  onApplyInsert
}: ChatMessageProps) {
  const { t } = useTranslation('ai')
  const isUser = message.role === 'user'
  const streaming = message.streaming === true
  const error = message.error
  const interrupted = message.interrupted === true
  const hasContent = message.content.trim() !== ''
  const chipLabel =
    isUser && message.action !== undefined ? t(ACTION_LABEL_KEYS[message.action]) : null
  // 来源章提示只挂在 assistant 气泡上：它才是「能不能回插」的对象，user 消息加标记只是噪音。
  const showForeign = fromOtherChapter && !isUser && hasContent

  return (
    <article className={`ai-msg ai-msg--${isUser ? 'user' : 'assistant'}`}>
      <div
        className={`ai-msg__bubble${error !== undefined ? ' is-error' : ''}`}
        aria-busy={streaming || undefined}
      >
        {isUser ? (
          <>
            {chipLabel !== null ? (
              <Tag tone="brand" className="ai-msg__chip">
                {chipLabel}
              </Tag>
            ) : null}
            {hasContent ? (
              <CollapsibleText text={message.content} className="ai-msg__text" />
            ) : null}
            {/* 输入与携带内容同时存在时：分隔线后展示选中预览 / 「卷名 · 章名」。 */}
            {message.attach !== undefined ? (
              <div className="ai-msg__attach">
                <CollapsibleText text={message.attach.text} className="ai-msg__attach-text" />
              </div>
            ) : null}
          </>
        ) : hasContent ? (
          <div className="ai-msg__body">
            <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {message.content}
            </Markdown>
            {streaming ? <span className="ai-msg__cursor" aria-hidden="true" /> : null}
          </div>
        ) : streaming ? (
          <span className="ai-msg__cursor ai-msg__cursor--solo" aria-hidden="true" />
        ) : null}
        {error !== undefined ? (
          <p className="ai-msg__error" role="alert">
            {t(AI_ERROR_TEXT_KEYS[error.code])}
          </p>
        ) : null}
        {/* 结构化中断标记：来自库内 `status`，与正文无关（正文不含任何中断说明）。 */}
        {interrupted ? <p className="ai-msg__interrupted">{t('message.interrupted')}</p> : null}
        {/* 来源章提示：跨章会话里其它章的回复不能回插本章正文，给一条轻量说明。 */}
        {showForeign ? <p className="ai-msg__foreign">{t('message.otherChapter')}</p> : null}
      </div>
      {applyActions !== null && !isUser ? (
        <div className="ai-msg__actions">
          {applyActions.replace ? (
            <Button size="sm" variant="secondary" onClick={() => onApplyReplace(message)}>
              {t('panel.apply.replace')}
            </Button>
          ) : null}
          {applyActions.insert ? (
            <Button size="sm" variant="ghost" onClick={() => onApplyInsert(message)}>
              {t(applyActions.insertAtEnd ? 'panel.apply.insertAtEnd' : 'panel.apply.insert')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default ChatMessage
