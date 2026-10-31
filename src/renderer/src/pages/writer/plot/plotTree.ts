/**
 * 写作页剧情树：渲染层类型镜像 + 展示口径纯函数。
 *
 * 数据真源为主进程 `plot` 域（`PlotLineRow` / `PlotSceneRow`，经 preload 全局 `Api`
 * 透传）。本模块**不发起 IPC**，只做：
 * - **类型镜像**：渲染层与主进程分离、无法 `import` 主进程模块，此处镜像
 *   `src/main/database/plot.ts` 的行类型（对齐 `outline/outlineTree.ts` 的镜像约定）；
 * - **分组排序**：`scenesOfLine` 按 `lineId` 归拢场景（组内 `sortOrder, id` 升序）；
 *   `groupScenesByYear` 全书跨线按绝对年聚合（同年一排，未定年组沉底）；
 * - **展示名**：空名回退占位（仅展示层，不改数据）。
 *
 * 剧情域为**剧情线 → 场景节点**两级结构：无特殊卷 / 特殊章、无编号、无 pin /
 * status / document 关联；仅 CRUD，无拖拽排序（对齐用户确认口径）。
 * 出场实体**不落库**：由渲染层据正文经 `entities.match` 匹配生成胶囊
 * （见 `usePlotBodyEntities`），故本模块无 `characters` 字段 / 解析函数。
 */

/** 剧情线行（镜像主进程 `PlotLineRow`）。`deletedAt` 非 null 表示已软删除；
 * `lineType` 为 8 型 key（默认 `'main'`），`lineColor` 为 16 色 key（默认首 key）。 */
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

/** 剧情线类型 8 项 key（镜像主进程；中文名由 `plot` ns 提供：主线 / 支线 / 感情 / 暗线 / 副线 / 成长 / 世界 / 悬念）。 */
export type PlotLineType =
  | 'main'
  | 'branch'
  | 'romance'
  | 'hidden'
  | 'sub'
  | 'growth'
  | 'world'
  | 'suspense'
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
/** 归一化线类型：命中 8 型白名单才透传，其余回退 `'main'`（与主进程同口径）。 */
export function normalizePlotLineType(value: unknown): PlotLineType {
  return typeof value === 'string' && (PLOT_LINE_TYPES as readonly string[]).includes(value)
    ? (value as PlotLineType)
    : DEFAULT_PLOT_LINE_TYPE
}

/** 剧情线颜色选项（镜像主进程：稳定 key + 色值；前 8 复用封面 `ring`，后 8 新增）。 */
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
/** 线颜色 key → 色值；未知 key 回退首色（与封面 `getCoverGradient` 同口径）。 */
export function getPlotLineColorValue(key: string): string {
  return (PLOT_LINE_COLORS.find((option) => option.key === key) ?? PLOT_LINE_COLORS[0]).value
}
/** 归一化线颜色：命中 16 色 key 才透传，其余回退首 key（与主进程同口径）。 */
export function normalizePlotLineColor(value: unknown): string {
  return typeof value === 'string' && PLOT_LINE_COLORS.some((option) => option.key === value)
    ? value
    : DEFAULT_PLOT_LINE_COLOR
}

/**
 * 场景节点行（镜像主进程 `PlotSceneRow`）。
 * 时间结构化三列：`timeEra`（''/bc/zero/ad，空 = 未设置）+ `timeYear`（null = 未设置）
 * + `timeDesc`（补充说明）；`timeText` 保留原文，结构化为空时回退展示 `timeText`。
 *
 * 正文富文本化（与大纲正文同口径）：`descriptionJson` 为**整条块级 Tiptap JSON**
 * （`null` = 空正文）；`description` 为**派生纯文本摘要**（卡片摘要 / 搜索真源，恒与 JSON 同步），
 * 故卡片 / 只读视图直接消费 `description` 即可，无需解析 JSON；亦为**实体匹配的正文真源**。
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

/** 创建剧情线选项（渲染层经 `api.plot.createLine` 透传；缺省取默认类型 + 首色）。 */
export interface CreatePlotLineOptions {
  lineType?: string
  lineColor?: string
  timelineId?: string
  defaultOrigin?: string
}

/** 更新剧情线补丁（渲染层经 `api.plot.updateLine` 透传；字段缺省则保持不变）。 */
export interface UpdatePlotLinePatch {
  name?: string
  lineType?: string
  lineColor?: string
}

/**
 * 剧情线显示名：`name` 非空取原文，否则回退占位 `emptyLabel`
 * （调用方经 `t('unnamedLine')` 提供，避免本模块硬编码用户可见文案）。
 */
export function plotLineLabel(line: Pick<PlotLineRow, 'name'>, emptyLabel: string): string {
  const name = line.name.trim()
  return name !== '' ? line.name : emptyLabel
}

/** 场景标题显示名：`title` 非空取原文，否则回退占位 `emptyLabel`。 */
export function plotSceneTitle(scene: Pick<PlotSceneRow, 'title'>, emptyLabel: string): string {
  const title = scene.title.trim()
  return title !== '' ? scene.title : emptyLabel
}

/** 结构化纪元标签（调用方经 `t('timeEra.*')` / `t('timeYearUnit')` 提供，避免本模块硬编码用户可见文案）。 */
export interface PlotEraLabels {
  bc: string
  zero: string
  ad: string
  /** 年份单位（如 zh-CN「年」；en 为空串）。 */
  yearUnit: string
}

/** 结构化时间纪元白名单（'' = 未设置；bc 纪前 / zero 元年 / ad 纪后，与主进程同口径）。 */
const PLOT_TIME_ERAS: readonly string[] = ['bc', 'zero', 'ad']

/**
 * 场景时间显示名：结构化（纪元 / 年 + 描述）优先，皆空时回退 `timeText` 原文，再空回占位。
 * 纪元标签由调用方传入（`PlotEraLabels`）；未传入时纪元段回退原始 era 码（仅兜底，不作展示承诺）。
 */
export function plotSceneTime(
  scene: Pick<PlotSceneRow, 'timeText' | 'timeEra' | 'timeYear' | 'timeDesc'>,
  emptyLabel: string,
  eraLabels?: PlotEraLabels
): string {
  const era = PLOT_TIME_ERAS.includes(scene.timeEra) ? scene.timeEra : ''
  const desc = scene.timeDesc.trim()
  let head = ''
  if (era !== '') {
    const label = eraLabels
      ? era === 'bc'
        ? eraLabels.bc
        : era === 'zero'
          ? eraLabels.zero
          : eraLabels.ad
      : era
    head = label
    // 元年无年份（编辑器在 zero 下禁用年份框并清空）；纪前 / 纪后有整数年才拼年份。
    if (
      era !== 'zero' &&
      typeof scene.timeYear === 'number' &&
      Number.isInteger(scene.timeYear)
    ) {
      head = `${label} ${scene.timeYear}${eraLabels ? eraLabels.yearUnit : ''}`
    }
  }
  const structured = head !== '' && desc !== '' ? `${head} · ${desc}` : head !== '' ? head : desc
  if (structured !== '') return structured
  const legacy = scene.timeText.trim()
  return legacy !== '' ? scene.timeText : emptyLabel
}

/**
 * 取某条剧情线下的场景（组内按 `sortOrder, id` 升序）。
 * 数据源为全书场景列表；仅按 `lineId` 过滤，不改其它线。
 */
export function scenesOfLine(scenes: readonly PlotSceneRow[], lineId: number): PlotSceneRow[] {
  return scenes
    .filter((scene) => scene.lineId === lineId)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)
}

/**
 * 场景绝对年换算（`timeEra` / `timeYear` → 可排序键）：
 * bc 纪前 → `-year` / zero 元年 → `0`（年份恒忽略，编辑器已清空）/ ad 纪后 → `+year`；
 * 未设置（纪元 '' 或纪前 / 纪后缺整数年）回 `null`（= 未定年组，沉底）。
 */
export function plotAbsoluteYear(
  scene: Pick<PlotSceneRow, 'timeEra' | 'timeYear'>
): number | null {
  if (scene.timeEra === 'zero') return 0
  if (
    (scene.timeEra === 'bc' || scene.timeEra === 'ad') &&
    typeof scene.timeYear === 'number' &&
    Number.isInteger(scene.timeYear)
  ) {
    return scene.timeEra === 'bc' ? -scene.timeYear : scene.timeYear
  }
  return null
}

/**
 * 年组行：全书跨线按绝对年聚合，同年一排（组内多卡）。
 * `absoluteYear` 为 null = 未定年组（沉底）；组内按 `sortOrder, id` 升序。
 */
export interface PlotYearGroup {
  /** 绝对年（null = 未定年组）。 */
  absoluteYear: number | null
  /** 分组键（`y:<绝对年>` / `undated`，供 React key）。 */
  key: string
  /** 组内场景（已按 `sortOrder, id` 升序）。 */
  scenes: PlotSceneRow[]
}

/**
 * 全书按绝对年分组：已定年升序，未定年组沉底；组内按 `sortOrder, id` 升序。
 * 跨线合并：不按 `lineId` 过滤，同年多线场景同组一排。
 */
export function groupScenesByYear(scenes: readonly PlotSceneRow[]): PlotYearGroup[] {
  const ordered = scenes
    .slice()
    .sort((a, b) => {
      const yearA = plotAbsoluteYear(a)
      const yearB = plotAbsoluteYear(b)
      const datedA = yearA === null ? 1 : 0
      const datedB = yearB === null ? 1 : 0
      if (datedA !== datedB) return datedA - datedB
      if (yearA !== null && yearB !== null && yearA !== yearB) return yearA - yearB
      return a.sortOrder - b.sortOrder || a.id - b.id
    })
  const groups: PlotYearGroup[] = []
  const indexByKey = new Map<string, PlotYearGroup>()
  for (const scene of ordered) {
    const absoluteYear = plotAbsoluteYear(scene)
    const key = absoluteYear === null ? 'undated' : `y:${absoluteYear}`
    let group = indexByKey.get(key)
    if (!group) {
      group = { absoluteYear, key, scenes: [] }
      indexByKey.set(key, group)
      groups.push(group)
    }
    group.scenes.push(scene)
  }
  return groups
}

/**
 * 年组时间列标签：绝对年 → 纪元文案（调用方经 `PlotEraLabels` 提供），
 * null（未定年组）回 `undatedLabel`（调用方经 `t('undatedScene')` 提供，不硬编码）。
 */
export { parseTimelineOrigin } from './timelineOriginParse'

export function plotYearLabel(
  absoluteYear: number | null,
  eraLabels: PlotEraLabels,
  undatedLabel: string
): string {
  if (absoluteYear === null) return undatedLabel
  if (absoluteYear === 0) return eraLabels.zero
  if (absoluteYear < 0) return `${eraLabels.bc} ${-absoluteYear}${eraLabels.yearUnit}`
  return `${eraLabels.ad} ${absoluteYear}${eraLabels.yearUnit}`
}
