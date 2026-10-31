import type { RefObject } from 'react'
import { useStableMeasure } from '../../../components/useStableMeasure'

/** 剧情线卡模式：内容列可用宽 ≥ 阈值走宽屏（卡与胶囊同行），否则紧凑（胶囊在卡下）。 */
export type SceneCardMode = 'wide' | 'compact'

/** 宽屏判定阈值（内容列可用宽，px）：低于此值走紧凑模式。 */
const WIDE_MIN_WIDTH = 640

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
 * 观察剧情时间轴根元素，按「内容列可用宽」（根宽 − 时间列 − 节点列）判定卡模式。
 *
 * 返回 `mode` 与 `key`（可用宽取整）。`key` 变化即代表布局变化，供
 * `useChipOverflow`（`components/useChipOverflow.ts`）触发重新测量。`enabled` 为 false
 * （未选中剧情线 / 根未挂载）时不观察，`mode` 保持紧凑。观察与「拖拽分隔条期间暂停测量」
 * 由 `useStableMeasure` 统一处理：拖拽中逐帧写回可用宽会让剧情卡折行 / 高度互相牵动而抖动，
 * 故拖动期间只保留结束后的一次测量（详见该文件）。
 */
export function useSceneCardMode(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
): { mode: SceneCardMode; key: number } {
  const width = useStableMeasure(ref, enabled, readContentWidth)

  return { mode: width >= WIDE_MIN_WIDTH ? 'wide' : 'compact', key: width }
}
