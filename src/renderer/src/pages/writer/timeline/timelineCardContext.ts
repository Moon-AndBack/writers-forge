import { createContext, useContext } from 'react'

/**
 * 时间线卡片尺寸：值域即各设置项的 CSS 变量字面值（`--tl-card-min-w` /
 * `--tl-card-max-w` / `--tl-card-min-h` / `--tl-card-max-h`），
 * 与 `styles/writer-plot.css` 的 `.timeline-main` 兜底默认值一致；恢复时逐项校验合法性。
 */
export interface TimelineCardSize {
  /** 最小宽度（卡片基准宽，不随内容收窄；列宽不足时由最大宽度收口） */
  minWidth: string
  /** 最大宽度（列宽上限，默认 100% 即随容器收口） */
  maxWidth: string
  /** 最小高度（卡片基准高） */
  minHeight: string
  /** 最大高度（超出以 overflow:hidden 收口，'none' 表示不限制） */
  maxHeight: string
}

/** 各设置项对应的 CSS 变量名（由 Provider 写入文档根元素，作用域同排版变量）。 */
export const TIMELINE_CARD_CSS_VARS = {
  minWidth: '--tl-card-min-w',
  maxWidth: '--tl-card-max-w',
  minHeight: '--tl-card-min-h',
  maxHeight: '--tl-card-max-h'
} as const

/** settings 表持久化键名：四项打包为一个 JSON 对象（对齐排版组的单键打包口径）。 */
export const TIMELINE_CARD_SETTING_KEY = 'timelineCardSize'

/** 默认卡片尺寸：与现状视觉一致（宽 320px、高 min 120px、宽上限 100%、高上限 240px）。 */
export const DEFAULT_TIMELINE_CARD_SIZE: TimelineCardSize = {
  minWidth: '320px',
  maxWidth: '100%',
  minHeight: '120px',
  maxHeight: '240px'
}

/** 最小宽度档位（--tl-card-min-w，默认 320px 与现状卡宽一致）。 */
export const CARD_MIN_WIDTH_OPTIONS: readonly string[] = ['240px', '280px', '320px', '380px']

/** 最大宽度档位（--tl-card-max-w；100% 即随内容列收口，为默认档）。 */
export const CARD_MAX_WIDTH_OPTIONS: readonly string[] = ['320px', '480px', '640px', '100%']

/** 最小高度档位（--tl-card-min-h，默认 120px 与现状一致）。 */
export const CARD_MIN_HEIGHT_OPTIONS: readonly string[] = ['120px', '150px', '180px', '240px']

/** 最大高度档位（--tl-card-max-h；上限 240px，无「不限制」档——最高 240px）。 */
export const CARD_MAX_HEIGHT_OPTIONS: readonly string[] = ['120px', '150px', '180px', '240px']

/** 恢复时逐项校验：任一项不在档位集合内即回退该项默认值。 */
export function resolveTimelineCardSize(value: unknown): TimelineCardSize {
  const raw = (value ?? {}) as Partial<Record<keyof TimelineCardSize, unknown>>
  const minWidth = String(raw.minWidth ?? '')
  const maxWidth = String(raw.maxWidth ?? '')
  const minHeight = String(raw.minHeight ?? '')
  const maxHeight = String(raw.maxHeight ?? '')

  return {
    minWidth: CARD_MIN_WIDTH_OPTIONS.includes(minWidth)
      ? minWidth
      : DEFAULT_TIMELINE_CARD_SIZE.minWidth,
    maxWidth: CARD_MAX_WIDTH_OPTIONS.includes(maxWidth)
      ? maxWidth
      : DEFAULT_TIMELINE_CARD_SIZE.maxWidth,
    minHeight: CARD_MIN_HEIGHT_OPTIONS.includes(minHeight)
      ? minHeight
      : DEFAULT_TIMELINE_CARD_SIZE.minHeight,
    maxHeight: CARD_MAX_HEIGHT_OPTIONS.includes(maxHeight)
      ? maxHeight
      : DEFAULT_TIMELINE_CARD_SIZE.maxHeight
  }
}

interface TimelineCardSizeContextValue {
  /** 当前卡片尺寸（值域即 CSS 变量字面值）。 */
  size: TimelineCardSize
  /** 更新一项并持久化（防抖由 Provider 实现）。 */
  setSize: (patch: Partial<TimelineCardSize>) => void
}

const TimelineCardSizeContext = createContext<TimelineCardSizeContextValue | null>(null)

/**
 * 读取时间线卡片尺寸。无 Provider（如独立测试渲染）时回退默认值 + 空操作，
 * 保证调用方不会因缺省上下文而崩溃。
 */
export function useTimelineCardSize(): TimelineCardSizeContextValue {
  const context = useContext(TimelineCardSizeContext)
  if (!context) {
    return { size: DEFAULT_TIMELINE_CARD_SIZE, setSize: () => undefined }
  }
  return context
}

/** context 仅供 TimelineCardSizeProvider.tsx 内部装配使用。 */
export { TimelineCardSizeContext }
