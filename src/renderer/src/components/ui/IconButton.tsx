import { forwardRef, useCallback } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useTooltip } from './Tooltip'
import type { TooltipPlacement } from './Tooltip'
import { cn } from '@renderer/lib/cn'
import '../../styles/components/icon-button.css'

export type IconButtonVariant = 'ghost' | 'solid'
export type IconButtonSize = 'sm' | 'md'
export type IconButtonTone = 'default' | 'danger'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉变体：ghost 无底色（hover 才出底），solid 常备柔和底；默认 ghost。 */
  variant?: IconButtonVariant
  /** 尺寸，默认 md（md 不额外输出尺寸类）。 */
  size?: IconButtonSize
  /** 语义色调：default 中性，danger 时 hover 呈危险色；默认 default。 */
  tone?: IconButtonTone
  /** 无障碍标签（必填，映射为 aria-label，同时作为自绘 tooltip 默认文案）。 */
  label: string
  /** 自绘 tooltip 文案；提供时覆盖 label（如 label="设置" tooltip="设置（即将推出）"）。 */
  tooltip?: string
  /** tooltip 首选方向（运行时仍会按视口空间自动避让）；默认 bottom。 */
  tooltipPlacement?: TooltipPlacement
  /** 图标内容（建议内联 SVG，随 currentColor 着色）。 */
  children?: ReactNode
}

/**
 * 图标按钮：圆形容器（`border-radius: 50%`），承载单个图标。
 * 透传原生 <button> 属性并支持 ref 转发；颜色一律走 theme.css 令牌 /
 * `color-mix` 派生，兼容 light / dark / sage / honey 四主题。
 *
 * 自绘 tooltip：hover / focus 显示（`tooltip ?? label` 为文案），带延迟与视口
 * 避让；原生 `title` 属性在此剥离（不再透传到 DOM），避免系统气泡与自绘浮层
 * 双份提示。无障碍仍由必填 `label` 映射的 aria-label 保证。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    variant = 'ghost',
    size = 'md',
    tone = 'default',
    label,
    tooltip,
    tooltipPlacement = 'bottom',
    className,
    children,
    type = 'button',
    title: _title,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    ...rest
  },
  ref
) {
  const {
    anchorRef,
    anchorProps,
    tooltip: tooltipNode
  } = useTooltip<HTMLButtonElement>({
    content: tooltip ?? label,
    placement: tooltipPlacement
  })

  // 剥离原生 title（不渲染系统气泡）；自绘 tooltip 取代之，避免双份提示。
  void _title

  // 合并转发 ref 与内部锚点 ref（React 19 回调 ref 可返回清理函数）。
  const setRef = useCallback(
    (node: HTMLButtonElement | null): void => {
      anchorRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [anchorRef, ref]
  )

  return (
    <>
      {tooltipNode}
      <button
        {...rest}
        ref={setRef}
        type={type}
        aria-label={label}
        aria-describedby={anchorProps['aria-describedby']}
        onMouseEnter={(event) => {
          anchorProps.onMouseEnter()
          onMouseEnter?.(event)
        }}
        onMouseLeave={(event) => {
          anchorProps.onMouseLeave()
          onMouseLeave?.(event)
        }}
        onFocus={(event) => {
          anchorProps.onFocus()
          onFocus?.(event)
        }}
        onBlur={(event) => {
          anchorProps.onBlur()
          onBlur?.(event)
        }}
        className={cn(
          'wf-iconbtn',
          `wf-iconbtn--${variant}`,
          `wf-iconbtn--${tone}`,
          size !== 'md' && `wf-iconbtn--${size}`,
          className
        )}
      >
        {children}
      </button>
    </>
  )
})

IconButton.displayName = 'IconButton'

export default IconButton
