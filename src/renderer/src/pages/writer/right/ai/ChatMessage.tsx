import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '../../../../components/ui'
import { AI_ERROR_TEXT_KEYS } from './aiErrorText'
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

export interface ChatMessageProps {
  message: AiConversationMessage
  /** 是否显示「替换选中 / 插入到光标后」按钮（仅 assistant 消息、非流式、非错误、未中断时）。 */
  canApply: boolean
  onApplyReplace: (text: string) => void
  onApplyInsert: (text: string) => void
}

/**
 * 单条 AI 消息气泡（对话模式与快捷结果共用）。
 *
 * - user / assistant 靠对齐方向与底色区分（无 transform，§8）；
 * - assistant 走 `react-markdown` + `remark-gfm`（元素类名见 `MD_COMPONENTS`）；
 * - 流式中追加闪烁光标（只动 opacity）；错误走 `ai` ns 的 `error.<code>`；
 * - `canApply` 时给出回插正文的两个动作，文本由父组件透传给 `applyToEditor`。
 */
export function ChatMessage({
  message,
  canApply,
  onApplyReplace,
  onApplyInsert
}: ChatMessageProps) {
  const { t } = useTranslation('ai')
  const isUser = message.role === 'user'
  const streaming = message.streaming === true
  const error = message.error
  const interrupted = message.interrupted === true
  const hasContent = message.content.trim() !== ''
  const showActions = canApply && !isUser && !streaming && error === undefined && hasContent

  return (
    <article className={`ai-msg ai-msg--${isUser ? 'user' : 'assistant'}`}>
      <div
        className={`ai-msg__bubble${error !== undefined ? ' is-error' : ''}`}
        aria-busy={streaming || undefined}
      >
        {hasContent ? (
          isUser ? (
            <p className="ai-msg__text">{message.content}</p>
          ) : (
            <div className="ai-msg__body">
              <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {message.content}
              </Markdown>
              {streaming ? <span className="ai-msg__cursor" aria-hidden="true" /> : null}
            </div>
          )
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
      </div>
      {showActions ? (
        <div className="ai-msg__actions">
          <Button size="sm" variant="secondary" onClick={() => onApplyReplace(message.content)}>
            {t('panel.apply.replace')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onApplyInsert(message.content)}>
            {t('panel.apply.insert')}
          </Button>
        </div>
      ) : null}
    </article>
  )
}

export default ChatMessage
