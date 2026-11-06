/**
 * 写作页三栏宽度（左栏 / 右栏）的持久化格式与钳制规则。
 *
 * 宽度真源仍是 `WorkspaceLayout` 的 React state（拖拽逐帧只重渲染该组件），
 * 本模块只负责三件事：
 * - settings 键名与 JSON 编解码（值为 `{ "left": 300, "right": 600 }`）；
 * - 单栏钳制到 CSS 对齐的上下限（与 `writer.css` 的 `min-width` / `max-width` 同步）；
 * - 视口过窄时按比例收缩**渲染值**（不覆盖用户已保存的偏好，窗口变宽后自动还原）。
 */

/** settings 表键名（JSON 字符串：`{ "left": number, "right": number }`）。 */
export const WORKSPACE_WIDTHS_SETTING_KEY = 'workspaceWidths'

/** 左栏宽度下限 / 上限 / 默认值（与 writer.css `.sidepane` 的 min-width / max-width 同步）。 */
export const SIDE_MIN = 180
export const SIDE_MAX = 480
export const SIDE_DEFAULT = 300

/*
  右栏默认 600px。断点 ≤1240px 隐藏右栏，故可见最小视口 1241px：悬浮活动栏时
  中栏约 297px；固定活动栏时仅约 253px，低于 .editor-pane 的 280px 下限，超出部分
  由 .app-viewport 的 overflow 裁掉（视口 ≥1268px 才完全容纳）。窗口缩放时左右两栏
  保持像素宽，多出 / 少掉的宽度由中栏（flex: 1）承担；仅当两栏之和仍挤不进视口时，
  才由 `fitWidthsToViewport` 按比例收缩（见下）。
*/
export const RIGHT_MIN = 450
export const RIGHT_MAX = 850
export const RIGHT_DEFAULT = 600

/** 中栏最小宽度（writer.css `.editor-pane` 的 `min-width`）：视口钳制时为它留出空间。 */
const CENTER_MIN_WIDTH = 280

/** 分隔条宽度（writer.css `.splitter`）：隐藏时宽度归零，不计入预算。 */
const SPLITTER_WIDTH = 8

export interface WorkspaceWidths {
  left: number
  right: number
}

/** 缺省宽度（左 300 / 右 600），读取失败或值非法时的回落目标。 */
export const DEFAULT_WORKSPACE_WIDTHS: WorkspaceWidths = {
  left: SIDE_DEFAULT,
  right: RIGHT_DEFAULT
}

/**
 * 单栏宽度兜底：非数字 / NaN / ±Infinity 回落 `fallback`（默认值），
 * 其余按 `[min, max]` 钳制（负数抬到 min，超大值压到 max）。
 */
export function clampPaneWidth(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/**
 * 反序列化持久值：容错处理缺键、非对象、数组、非法 JSON 与坏字段。
 * 单栏非法只回落该栏默认值，另一栏的合法值仍然保留。
 */
export function decodeWorkspaceWidths(raw: string | null): WorkspaceWidths {
  if (!raw) return DEFAULT_WORKSPACE_WIDTHS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return DEFAULT_WORKSPACE_WIDTHS
    }
    const record = parsed as Record<string, unknown>
    return {
      left: clampPaneWidth(record.left, SIDE_MIN, SIDE_MAX, SIDE_DEFAULT),
      right: clampPaneWidth(record.right, RIGHT_MIN, RIGHT_MAX, RIGHT_DEFAULT)
    }
  } catch {
    return DEFAULT_WORKSPACE_WIDTHS
  }
}

/** 序列化为 settings 字符串值。 */
export function encodeWorkspaceWidths(widths: WorkspaceWidths): string {
  return JSON.stringify({ left: widths.left, right: widths.right })
}

export interface FitWidthsOptions {
  /** 左栏是否自动收起（无左栏的模块）：收起时不占预算，也不参与收缩。 */
  leftHidden: boolean
  /** 右栏是否隐藏（标题栏偏好 / 窄窗断点）。 */
  rightHidden: boolean
}

/**
 * 按可用视口宽度收缩可见栏宽（纯渲染值，不写回持久偏好）。
 *
 * 预算 = 容器实测宽 - 可见分隔条 - 中栏最小宽；两栏之和未超预算时原样返回。
 * 超出部分按「各栏相对自身下限的余量」等比压缩，保证两栏都停在下限而非某一栏被压到 0；
 * 余量为 0（都很窄）时各取下限，进一步的溢出交给中栏 min-width 与外层 overflow。
 */
export function fitWidthsToViewport(
  widths: WorkspaceWidths,
  availableWidth: number,
  { leftHidden, rightHidden }: FitWidthsOptions
): WorkspaceWidths {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return widths

  const splitters = (leftHidden ? 0 : SPLITTER_WIDTH) + (rightHidden ? 0 : SPLITTER_WIDTH)
  const budget = availableWidth - splitters - CENTER_MIN_WIDTH
  const visibleLeft = leftHidden ? 0 : widths.left
  const visibleRight = rightHidden ? 0 : widths.right
  if (visibleLeft + visibleRight <= budget) return widths

  const slackLeft = leftHidden ? 0 : Math.max(0, widths.left - SIDE_MIN)
  const slackRight = rightHidden ? 0 : Math.max(0, widths.right - RIGHT_MIN)
  const slack = slackLeft + slackRight
  if (slack <= 0) {
    return {
      left: leftHidden ? widths.left : SIDE_MIN,
      right: rightHidden ? widths.right : RIGHT_MIN
    }
  }

  const factor = Math.max(0, 1 - (visibleLeft + visibleRight - budget) / slack)
  return {
    left: leftHidden ? widths.left : SIDE_MIN + slackLeft * factor,
    right: rightHidden ? widths.right : RIGHT_MIN + slackRight * factor
  }
}
