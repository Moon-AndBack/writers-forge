import { Component, useCallback, useState } from 'react'
import type { ErrorInfo, ReactElement, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { createLogger } from '../lib/log'
import { Button } from './ui/Button'
import { Window } from './ui/Window'
import '../styles/components/error-boundary.css'

/** 默认日志作用域；根边界 / 路由边界通过 `scope` 分别记录。 */
const DEFAULT_SCOPE = 'errorBoundary'

/** 复制按钮三态对应的文案 key（避免嵌套三元拖累可读性）。 */
const COPY_LABEL_KEYS = {
  idle: 'errorBoundary.copy',
  copied: 'errorBoundary.copied',
  failed: 'errorBoundary.copyFailed'
} as const

type CopyState = keyof typeof COPY_LABEL_KEYS

/** 把任意抛出值归一为 Error，保证兜底界面与日志始终有 name / message / stack。 */
function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value
  return new Error(typeof value === 'string' ? value : String(value))
}

/** `resetKeys` 逐项比较：任一项变化即复位（如路由 pathname 变化）。 */
function sameResetKeys(
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a.length !== b.length) return false
  return a.every((key, index) => Object.is(key, b[index]))
}

/** 复制到剪贴板的完整详情：摘要 + 堆栈 + React 组件栈。 */
function formatDetails(error: Error, componentStack: string): string {
  const parts = [`${error.name}: ${error.message}`]
  if (error.stack) parts.push(error.stack)
  if (componentStack) parts.push(`Component stack:\n${componentStack}`)
  return parts.join('\n\n')
}

export interface ErrorBoundaryProps {
  children: ReactNode
  /** 日志作用域：两层边界分别记录，便于从日志定位是外壳还是页面崩溃。 */
  scope?: string
  /** 追加到兜底容器上的类名（根边界用 `wf-error-boundary--root` 铺主题底色）。 */
  className?: string
  /**
   * 任一值变化时自动复位。路由边界传入 `[pathname]`：页面崩溃后用户切到别处，
   * 不应继续停留在兜底界面（未传则保持既有的「重新加载」恢复路径）。
   */
  resetKeys?: readonly unknown[]
}

interface ErrorBoundaryState {
  error: Error | null
  componentStack: string
}

/**
 * 渲染层错误边界：捕获子树在渲染 / 生命周期中抛出的异常，渲染可恢复的兜底界面，
 * 避免 React 卸载整棵树后只剩空白窗口。
 *
 * - 必须包在 `I18nextProvider` / `LocaleProvider` 内层：兜底界面经 `t()` 取文案，
 *   并随语言切换即时更新；
 * - `getDerivedStateFromError` 只负责切兜底态，日志统一在 `componentDidCatch` 落盘
 *   （`error` + `errorInfo.componentStack`）；
 * - 无法捕获事件处理器 / 异步回调中的异常，那部分由 `lib/globalErrorHandlers`
 *   的窗口级监听兜底（只落盘，不弹提示）。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '' }

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { error: normalizeError(error) }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    // 进入兜底态后再补组件栈：componentDidCatch 在兜底界面提交后触发，setState 会再渲染一次。
    this.setState({ componentStack: errorInfo.componentStack ?? '' })
    const normalized = normalizeError(error)
    createLogger(this.props.scope ?? DEFAULT_SCOPE).error('渲染异常被错误边界捕获', {
      message: `${normalized.name}: ${normalized.message}`,
      stack: normalized.stack,
      componentStack: errorInfo.componentStack
    })
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error === null) return
    if (sameResetKeys(prevProps.resetKeys, this.props.resetKeys)) return
    this.setState({ error: null, componentStack: '' })
  }

  private readonly handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error, componentStack } = this.state
    if (error === null) return this.props.children

    return (
      <div className={cn('wf-error-boundary', this.props.className)} role="alert">
        <ErrorFallback error={error} componentStack={componentStack} onReload={this.handleReload} />
      </div>
    )
  }
}

interface ErrorFallbackProps {
  error: Error
  componentStack: string
  onReload: () => void
}

/**
 * 兜底界面：标题 + 说明 + 两行截断的错误摘要 + 「复制错误详情」/「重新加载」。
 * 复用 `Window`（面板 / 标题 / 底栏）与 `Button`，视觉与设置弹窗同源。
 */
function ErrorFallback({ error, componentStack, onReload }: ErrorFallbackProps): ReactElement {
  const { t } = useTranslation('common')
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const summary = `${error.name}: ${error.message}`

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      if (navigator.clipboard?.writeText === undefined) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(formatDetails(error, componentStack))
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }, [error, componentStack])

  return (
    <Window
      size="md"
      title={t('errorBoundary.title')}
      footer={
        <>
          <span className="wf-error-boundary__spacer" />
          <Button variant="secondary" onClick={() => void handleCopy()}>
            {t(COPY_LABEL_KEYS[copyState])}
          </Button>
          <Button variant="primary" onClick={onReload}>
            {t('errorBoundary.reload')}
          </Button>
        </>
      }
    >
      <p className="wf-error-boundary__desc">{t('errorBoundary.description')}</p>
      <p className="wf-error-boundary__summary" title={summary}>
        {summary}
      </p>
    </Window>
  )
}

export default ErrorBoundary
