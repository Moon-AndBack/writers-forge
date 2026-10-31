import { useMemo } from 'react'
import { useSetModuleStatusBar } from '../../../shell/statusBarContext'
import TypographyControls from '../../../shell/statusBarWidgets/TypographyControls'
import ZoomControls from '../../../shell/statusBarWidgets/ZoomControls'

/**
 * 剧情模块状态栏：剧情正文**聚焦编辑**时，把右下角排版组（字体 / 行距 / 字距 / 缩放，
 * **不含页宽**——剧情正文无版心，`--page-width` 只作用于章节编辑器的 `.editor-inner`）
 * 注册到状态栏 `right` 插槽；未编辑时不注册，外壳右下角回退全局 `.st-right`。
 *
 * 去重：`App.tsx` 的 `StatusBarWidgets` 按「当前模块是否自带 `right`」跳过全局组，
 * 故编辑剧情时不会出现两组控件 / 页宽残留；非 plot 模块未注册 `right`，行为不变。
 *
 * 排版变量（`--doc-font` / `--doc-line` / `--doc-letter` / `--doc-zoom`）挂在文档根，
 * 剧情正文容器复用 `.doc-body` 口径（见 `PlotBodyEditor`），故对剧情正文生效。
 *
 * 编辑态真源为 `usePlotWorkspace().editing`（经 `reportEditing` 上提）；`slots` 以
 * `useMemo` 稳定引用，避免无意义重注册（见 `statusBarContext` 注释）。
 */
export function usePlotStatusBar(editing: boolean): void {
  const slots = useMemo(
    () =>
      editing
        ? {
            right: (
              <div className="st-right">
                <TypographyControls omit={['page']} />
                <ZoomControls />
              </div>
            )
          }
        : null,
    [editing]
  )

  useSetModuleStatusBar('plot', slots)
}
