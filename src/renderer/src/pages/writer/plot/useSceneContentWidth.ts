import type { RefObject } from 'react'
import { useStableMeasure } from '../../../components/useStableMeasure'

/**
 * 读「内容列可用宽」：根宽 − 时间列 − 节点列。列宽取自根元素上级联的
 * `--plot-col-time` / `--plot-col-node`（随窄窗媒体查询自适应）。
 */
function readContentWidth(el: HTMLElement): number {
  const style = window.getComputedStyle(el)
  const time = Number.parseFloat(style.getPropertyValue('--plot-col-time')) || 0
  const node = Number.parseFloat(style.getPropertyValue('--plot-col-node')) || 0
  return Math.max(0, Math.round(el.clientWidth - time - node))
}

/**
 * 观察剧情时间轴根元素，返回「内容列可用宽」（取整，px）作为布局签名。
 *
 * 剧情卡已统一为纵向单列（胶囊在卡内底部），不再需要宽屏 / 紧凑双模式；
 * 该签名仅供 `useChipOverflow`（`components/useChipOverflow.ts`）在可用宽变化时
 * 触发胶囊容量重测。`enabled` 为 false（未选中剧情线 / 根未挂载）时不观察。
 * 观察与「拖拽分隔条期间暂停测量」由 `useStableMeasure` 统一处理。
 */
export function useSceneContentWidth(ref: RefObject<HTMLElement | null>, enabled: boolean): number {
  return useStableMeasure(ref, enabled, readContentWidth)
}
