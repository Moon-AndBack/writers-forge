import { useMemo } from 'react'
import { useSetModuleStatusBar } from '../../../shell/statusBarContext'
import TimelineCardSizeControls from './TimelineCardSizeControls'

/**
 * 时间线模块状态栏：把右下角**卡片尺寸控件**（最小 / 最大宽度、最小 / 最大高度，各 4 档）
 * 注册到状态栏 `right` 插槽——时间线页右下角以此**替换**外壳全局排版 / 缩放组。
 *
 * 去重：`App.tsx` 的 `StatusBarWidgets` 按「当前模块是否自带 `right`」跳过全局组，
 * 故时间线页不会出现两组控件；非 timeline 模块未注册 `right`，外壳右下角回退全局组，
 * 行为不变。
 *
 * 尺寸真源为 `TimelineCardSizeProvider`（App 层，文档根 CSS 变量 + settings 防抖落库），
 * 此处仅负责把控件挂进状态栏。`slots` 以 `useMemo` 稳定引用，避免无意义重注册。
 */
export function useTimelineStatusBar(): void {
  const slots = useMemo(
    () => ({
      right: (
        <div className="st-right">
          <TimelineCardSizeControls />
        </div>
      )
    }),
    []
  )

  useSetModuleStatusBar('timeline', slots)
}
