import { getDb } from './index'
import { derivePlainText, normalizeRichTextJson, wrapPlainTextToDoc } from './richText'
import { PLOT_TIME_ERAS } from '../../shared/plot'

/**
 * 线类型 / 色板 / time origin 解析的**单一真源**在 `src/shared/plot.ts`（与渲染层共用）。
 * 此处按本域既有公开面原样重导出，`plot.ts` barrel 与外部导入路径零改动。
 */
export {
  DEFAULT_PLOT_LINE_COLOR,
  DEFAULT_PLOT_LINE_TYPE,
  PLOT_LINE_COLORS,
  PLOT_LINE_TYPES,
  normalizePlotLineColor,
  normalizePlotLineType,
  parseTimelineOrigin
} from '../../shared/plot'
export type { PlotLineColorOption, PlotLineType } from '../../shared/plot'

/**
 * 剧情域 —— 剧情线与场景**共享的类型、常量与纯函数辅助**（自 `plot.ts` 原样拆出）。
 *
 * 承接：行 / 入参 / 补丁类型、列 SQL 片段、线类型与色板（真源在 `src/shared/plot.ts`，
 * 此处仅重导出）、时间结构化辅助（`normalizeTimeEra` / `normalizeTimeYear`）、
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
 *
 * `descriptionJson` **仅完整行携带**：列表查询走投影列（`PLOT_SCENE_LIST_COLUMNS`）时不返回，
 * 正文按 id 经 `plot:getSceneContent` 按需读取；`description` 摘要恒在（卡片 / 搜索使用）。
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
  /** 整条块级 Tiptap JSON 串；`null` = 空正文。**列表投影行缺省**（未读取）。 */
  descriptionJson?: string | null
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

/** 场景列 SQL 片段（AS 别名对齐 `PlotSceneRow`，含正文列；供按 id 读完整行）。 */
export const PLOT_SCENE_COLUMNS =
  'id, book_id AS bookId, line_id AS lineId, time_text AS timeText, time_era AS timeEra, time_year AS timeYear, time_desc AS timeDesc, title, description, description_json AS descriptionJson, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'

/**
 * 场景列表投影列：去掉 `description_json`，保留派生摘要 `description`。
 * 列表消费方（时间轴卡片 / 剧情页签卡片 / 悬停全文 / 实体胶囊）只用摘要，正文由右栏
 * 选中时经 `plot:getSceneContent` 按需读取，避免一次搬回全书正文 JSON。
 */
export const PLOT_SCENE_LIST_COLUMNS =
  'id, book_id AS bookId, line_id AS lineId, time_text AS timeText, time_era AS timeEra, time_year AS timeYear, time_desc AS timeDesc, title, description, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt'

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
