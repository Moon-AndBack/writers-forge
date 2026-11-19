/**
 * preload 类型域 · **剧情**（主进程 `database/plot`）+ **窗口**（`resizeSnap` / 标题栏）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 取用，不逐字镜像（理由见 `database.d.ts` 文件头）。
 *
 * ⚠️ 窗口材质 `WindowMaterial` **取自主进程真源**（`../../main/windowMaterial` 已导出，此处仅
 * 转发）；标题栏覆盖选项与封面载荷是纯跨 IPC 的形状（主进程按值处理、不导出该类型），故本地声明。
 */

import type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneContentRow,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch
} from '../../main/database/plot'
import type {
  PlotSceneEntityInput,
  PlotSceneEntityRow
} from '../../main/database/plotSceneEntities'
import type { SnapConfig, SnapStatus } from '../../main/resizeSnap'
import type { WindowMaterial } from '../../main/windowMaterial'

export type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneContentRow,
  PlotSceneEntityInput,
  PlotSceneEntityRow,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch,
  SnapConfig,
  SnapStatus,
  WindowMaterial
}

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

/** 封面缩略图写入入参：`data` 跨 IPC 为 Uint8Array。 */
export interface CoverThumbInput {
  mime: string
  data: Uint8Array
}

/** 封面取图结果：`kind='thumb'` 命中缩略图，`kind='original'` 为原图回退（待回填）。 */
export interface CoverDisplayPayload {
  kind: 'thumb' | 'original'
  mime: string
  bytes: number
  data: Uint8Array
}
