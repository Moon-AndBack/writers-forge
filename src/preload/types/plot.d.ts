/**
 * preload 类型域 · **剧情**（主进程 `database/plot`）+ **窗口**（`resizeSnap` / 标题栏）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 取用，不逐字镜像（理由见 `database.d.ts` 文件头）。
 *
 * ⚠️ 窗口材质的 `'acrylic' | 'mica' | 'none'` 与标题栏覆盖选项是**渲染层唯一持有**的形状
 * （主进程按值处理、不导出该类型），故本地声明。
 */

import type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch
} from '../../main/database/plot'
import type {
  PlotSceneEntityInput,
  PlotSceneEntityRow
} from '../../main/database/plotSceneEntities'
import type { SnapConfig, SnapStatus } from '../../main/resizeSnap'

export type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneEntityInput,
  PlotSceneEntityRow,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch,
  SnapConfig,
  SnapStatus
}

/** 系统窗口材质档位：`'acrylic'` 亚克力 / `'mica'` 云母 / `'none'` 关（仅 Windows 11 22H2+）。 */
export type WindowMaterial = 'acrylic' | 'mica' | 'none'

/** 标题栏覆盖层配置（主进程 `window:titlebar:set-overlay` 入参）。 */
export interface TitleBarOverlayOptions {
  color?: string
  symbolColor?: string
  height?: number
}

/** 封面图读取结果：`data` 为 Uint8Array（structured clone 跨 IPC 传输形式）。 */
export interface CoverPayload {
  mime: string
  data: Uint8Array
}
