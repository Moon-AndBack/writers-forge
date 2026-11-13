import { getDb } from './index'
import { derivePlainText, normalizeRichTextJson, wrapPlainTextToDoc } from './richText'

/**
 * 剧情域 —— 剧情线与场景**共享的类型、常量与纯函数辅助**（自 `plot.ts` 原样拆出）。
 *
 * 承接：行 / 入参 / 补丁类型、列 SQL 片段、线类型与颜色白名单及其归一化、
 * 时间结构化辅助（`normalizeTimeEra` / `normalizeTimeYear` / `parseTimelineOrigin`）、
 * 场景正文双列同步解析（`resolveSceneDescription`）、排序追加辅助（`next*SortOrder`）。
 *
 * 供 `plotLines.ts` / `plotScenes.ts` 内部共用；`plot.ts` 只重导出**原本已公开**的符号，
 * 模块私有辅助（`NOW` / 列片段 / `normalizeTimeEra` / `next*SortOrder` 等）不经 barrel 暴露。
 */

/** 毫秒精度时间戳表达式，对齐 `outline.ts` / `chapterGroups.ts`。 */
export const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** 默认剧情线名：空串（缺名时落空串，展示层以 i18n `plot.unnamedLine` 兜底）。 */
export const DEFAULT_LINE_NAME = ''

/** 剧情线行。`deletedAt` 非 null 表示已软删除；`lineType` 为 8 型 key（默认 `'main'`），
 * `lineColor` 为 16 色 key（默认首 key `'purple'`），非法值读时以 normalize 回退默认。 */
export interface PlotLineRow {
  id: number
  bookId: string
  name: string
  lineType: string
  lineColor: string
  timelineId: string
  defaultOrigin: string
  sortOrder: number
  createdAt: string
  deletedAt: string | null
}

/**
 * 场景节点行。`deletedAt` 非 null 表示已软删除。
 * 时间结构化三列：`timeEra`（''/bc/zero/ad，空 = 未设置）+ `timeYear`（null = 未设置）
 * + `timeDesc`（补充说明）；`timeText` 保留原文，结构化为空时回退展示 `timeText`。
 *
 * 正文富文本化（与大纲正文同口径）：`descriptionJson` 为**整条块级 Tiptap JSON**
 * （`null` = 空正文）；`description` 为**派生纯文本摘要**（卡片摘要 / 搜索真源，恒与 JSON 同步）。
 * 出场实体不再落库：由渲染层据正文匹配实体生成胶囊。
 */
export interface PlotSceneRow {
  id: number
  bookId: string
  lineId: number
  timeText: string
  timeEra: string
  timeYear: number | null
  timeDesc: string
  title: string
  /** 派生纯文本摘要（`descriptionJson` 的 text 拼接结果；空正文 = ''）。 */
  description: string
  /** 整条块级 Tiptap JSON 串；`null` = 空正文。 */
  descriptionJson: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 创建场景入参（均可选，缺省取空；`timeYear` 缺省为 null）。
 * `descriptionJson` 缺省时按纯文本 `description` 包成合法富文本文档（两列恒同步）。 */
export interface CreatePlotSceneInput {
  timeText?: string
  timeEra?: string
  timeYear?: number | null
  timeDesc?: string
  title?: string
  description?: string
  descriptionJson?: string | null
}

/** 更新场景补丁：字段缺省则保持不变（`timeYear` 显式传 null = 清空）。
 * `descriptionJson` 显式传 null = 清空正文；仅传 `description`（纯文本）时按行包成富文本文档。 */
export interface UpdatePlotScenePatch {
  timeText?: string
  timeEra?: string
  timeYear?: number | null
  timeDesc?: string
  title?: string
  description?: string
  descriptionJson?: string | null
}

/** 剧情线列 SQL 片段（AS 别名对齐 `PlotLineRow`）。 */
export const PLOT_LINE_COLUMNS =
  'id, book_id AS bookId, name, line_type AS lineType, line_color AS lineColor, timeline_id AS timelineId, default_origin AS defaultOrigin, sort_order AS sortOrder, created_at AS createdAt, deleted_at AS deletedAt'

/** 场景列 SQL 片段（AS 别名对齐 `PlotSceneRow`）。 */
export const PLOT_SCENE_COLUMNS =
  'id, book_id AS bookId, line_id AS lineId, time_text AS timeText, time_era AS timeEra, time_year AS timeYear, time_desc AS timeDesc, title, description, description_json AS descriptionJson, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'

/** 结构化时间纪元白名单（'' = 未设置；bc 纪前 / zero 元年 / ad 纪后）。 */
const PLOT_TIME_ERAS: readonly string[] = ['bc', 'zero', 'ad']

/** 剧情线类型 8 项 key（中文：主线 / 支线 / 感情 / 暗线 / 副线 / 成长 / 世界 / 悬念；默认 `'main'`）。 */
export type PlotLineType =
  'main' | 'branch' | 'romance' | 'hidden' | 'sub' | 'growth' | 'world' | 'suspense'
export const PLOT_LINE_TYPES: readonly PlotLineType[] = [
  'main',
  'branch',
  'romance',
  'hidden',
  'sub',
  'growth',
  'world',
  'suspense'
]
export const DEFAULT_PLOT_LINE_TYPE: PlotLineType = 'main'
/** 归一化线类型：命中 8 型白名单才透传，其余一律回退 `'main'`。 */
export function normalizePlotLineType(value: unknown): PlotLineType {
  return typeof value === 'string' && (PLOT_LINE_TYPES as readonly string[]).includes(value)
    ? (value as PlotLineType)
    : DEFAULT_PLOT_LINE_TYPE
}

/** 剧情线颜色选项：稳定 key 持久化；前 8 复用封面 `ring`，后 8 新增（展示两行 8 列）。 */
export interface PlotLineColorOption {
  key: string
  label: string
  value: string
}
export const PLOT_LINE_COLORS: readonly PlotLineColorOption[] = [
  { key: 'purple', label: '紫罗兰', value: '#5b4de8' },
  { key: 'blue', label: '天青', value: '#2f9ae0' },
  { key: 'green', label: '松林', value: '#0f7b4f' },
  { key: 'orange', label: '琥珀', value: '#9d5d00' },
  { key: 'violet', label: '暮紫', value: '#5c3a8a' },
  { key: 'teal', label: '湖绿', value: '#0f7b7b' },
  { key: 'rose', label: '绯红', value: '#c42b1c' },
  { key: 'slate', label: '石板', value: '#475069' },
  { key: 'pink', label: '樱粉', value: '#e64980' },
  { key: 'coral', label: '珊瑚', value: '#f76707' },
  { key: 'gold', label: '鎏金', value: '#eab308' },
  { key: 'lime', label: '荧绿', value: '#74b816' },
  { key: 'cyan', label: '晴空', value: '#15aabf' },
  { key: 'indigo', label: '靛蓝', value: '#748ffc' },
  { key: 'brown', label: '赭石', value: '#8c5a2b' },
  { key: 'gray', label: '雾灰', value: '#868e96' }
]
export const DEFAULT_PLOT_LINE_COLOR = PLOT_LINE_COLORS[0].key
/** 归一化线颜色：命中 16 色 key 才透传，其余一律回退首 key。 */
export function normalizePlotLineColor(value: unknown): string {
  return typeof value === 'string' && PLOT_LINE_COLORS.some((option) => option.key === value)
    ? value
    : DEFAULT_PLOT_LINE_COLOR
}

/** 创建剧情线选项：类型 / 颜色缺省取默认（非法值同样回退默认）。 */
export interface CreatePlotLineOptions {
  lineType?: unknown
  lineColor?: unknown
  timelineId?: unknown
  defaultOrigin?: unknown
}

/** 更新剧情线补丁：字段缺省则保持不变（`name` 空白视为未提供）。 */
export interface UpdatePlotLinePatch {
  name?: string
  lineType?: unknown
  lineColor?: unknown
}

/* ---------- 时间结构化辅助 ---------- */

/** 归一化纪元入参：白名单 bc/zero/ad 外一律回退 ''（未设置）。 */
export function normalizeTimeEra(value: unknown): string {
  if (typeof value !== 'string') return ''
  return PLOT_TIME_ERAS.includes(value) ? value : ''
}

/** 归一化年份入参：非负整数透传，其余（含负数）一律回退 null（未设置）。 */
export function normalizeTimeYear(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/** 解析时间线 origin 自由文本 → 结构化时间四字段。 */
export function parseTimelineOrigin(origin: unknown): {
  timeEra: string
  timeYear: number | null
  timeDesc: string
  timeText: string
} {
  const raw = typeof origin === 'string' ? origin.trim() : ''
  // 回填输出留空：展示层经 i18n 兜底（元年 / 时间未定）；
  // 下方判据中的 '元年' / '时间未定' 为存量数据格式，保持原样。
  if (raw === '' || raw === '元年')
    return { timeEra: 'zero', timeYear: null, timeDesc: '', timeText: '' }
  if (raw === '时间未定') return { timeEra: '', timeYear: null, timeDesc: '', timeText: '' }
  const bcMatch = raw.match(/^纪前\s*(\d+)\s*年?$/)
  if (bcMatch) return { timeEra: 'bc', timeYear: Number(bcMatch[1]), timeDesc: '', timeText: raw }
  const adMatch = raw.match(/^纪后\s*(\d+)\s*年?$/)
  if (adMatch) return { timeEra: 'ad', timeYear: Number(adMatch[1]), timeDesc: '', timeText: raw }
  return { timeEra: '', timeYear: null, timeDesc: raw, timeText: raw }
}

/* ---------- 正文（富文本 + 派生摘要）辅助 ---------- */

/**
 * 归一化场景正文，返回**恒同步**的落库两列（`description_json` + `description`）：
 * - 传入 `descriptionJson`（富文本路径，批B 编辑器）：归一化 JSON（null / 空串 / 空正文 → null），
 *   摘要由 JSON 派生（`derivePlainText`，与大纲 `text` 同口径）；
 * - 仅传 `description`（纯文本路径：老接口 / 教学种子 / 批A 前的表单）：包成合法富文本文档
 *   （`wrapPlainTextToDoc`，按行拆段），摘要保留原文。
 *
 * 两条路径都保证「富文本 JSON 与纯文本摘要」一致，避免二者漂移（对齐大纲 `saveOutlineContent`
 * 同一事务写 `content_json` + `text` 的口径）。
 */
export function resolveSceneDescription(
  descriptionJson: string | null | undefined,
  plainText: string
): { descriptionJson: string | null; description: string } {
  if (descriptionJson === undefined) {
    const json = wrapPlainTextToDoc(plainText)
    return { descriptionJson: json, description: json === null ? '' : plainText }
  }
  const json = normalizeRichTextJson(descriptionJson)
  return { descriptionJson: json, description: json === null ? '' : derivePlainText(json) }
}

/* ---------- 排序辅助 ---------- */

/** 该书下一个剧情线 sortOrder（含已软删线，避免与待还原线冲突）。 */
export function nextLineSortOrder(bookId: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM plot_lines WHERE book_id = ?')
    .get(bookId) as { next: number }
  return row.next
}

/** 该书下一个场景 sortOrder（含已软删场景，避免冲突）。
 * 落地口径（二选一已定：**追加**）：新增一律 `MAX(sort_order) + 1` 追加，
 * 展示按绝对年排序、`sort_order` 仅同年 / 未定年组内兜底（见 `listPlotScenes`）。 */
export function nextSceneSortOrder(bookId: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM plot_scenes WHERE book_id = ?')
    .get(bookId) as { next: number }
  return row.next
}
