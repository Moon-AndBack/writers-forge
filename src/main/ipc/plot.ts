import { ipcMain } from 'electron'
import { logger } from '../logger'
import { isValidRichTextJson } from '../database/richText'
import {
  backfillPlotLineDefaults,
  backfillPlotLineTimeline,
  createPlotLine,
  createPlotScene,
  deletePlotLine,
  deletePlotScene,
  listPlotLines,
  listPlotScenes,
  renamePlotLine,
  updatePlotLine,
  updatePlotScene,
  type CreatePlotLineOptions,
  type CreatePlotSceneInput,
  type UpdatePlotLinePatch,
  type UpdatePlotScenePatch
} from '../database/plot'
import {
  listPlotSceneEntities,
  setPlotSceneEntities,
  type PlotSceneEntityInput
} from '../database/plotSceneEntities'

/** 剧情域日志 scope。 */
const log = logger.scope('plot')

/** 写操作包装：执行数据库写并统一记录成功（debug）/ 失败（error）；失败原样抛出。 */
function runWrite<T>(channel: string, context: Record<string, unknown>, fn: () => T): T {
  try {
    const result = fn()
    log.debug(`${channel} 完成`, context)
    return result
  } catch (error) {
    log.error(`${channel} 失败`, { ...context, error })
    throw error
  }
}

/** 校验正整数 id。 */
function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/** 校验非空字符串（去空白后）。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 校验可选字符串：undefined / null / 字符串。 */
function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

/** 校验可选富文本正文 JSON：undefined / null / 空串 / 合法 JSON 串（与大纲同口径）。 */
function isOptionalContentJson(value: unknown): value is string | null | undefined {
  return value === undefined || isValidRichTextJson(value)
}

/** 校验结构化纪元：undefined / null / ''（未设置）/ bc 纪前 / zero 元年 / ad 纪后。 */
function isOptionalTimeEra(value: unknown): value is string | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && (value === '' || ['bc', 'zero', 'ad'].includes(value)))
  )
}

/** 校验结构化年份：undefined / null（未设置）/ 整数。 */
function isOptionalTimeYear(value: unknown): value is number | null | undefined {
  return (
    value === undefined || value === null || (typeof value === 'number' && Number.isInteger(value))
  )
}

/** 关联设定的 `role` 文本上限（预留扩展位，超长截断而非整包拒绝）。 */
const SCENE_ENTITY_ROLE_MAX = 80

/** 单场景关联设定条数上限（防止异常入参拖垮写入）。 */
const SCENE_ENTITY_MAX = 500

/**
 * 校验关联设定入参：必须是数组，逐项为 `{ entityId: 正整数, role?, sortOrder? }`；
 * 任一项畸形 → 返回 undefined（调用方回 null，整包拒绝）。合法项原样归一后返回。
 */
function sanitizeSceneEntityRows(value: unknown): PlotSceneEntityInput[] | undefined {
  if (!Array.isArray(value) || value.length > SCENE_ENTITY_MAX) return undefined
  const rows: PlotSceneEntityInput[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
    const record = raw as Record<string, unknown>
    if (!isPositiveInt(record.entityId)) return undefined
    if (record.role !== undefined && typeof record.role !== 'string') return undefined
    if (
      record.sortOrder !== undefined &&
      (typeof record.sortOrder !== 'number' || !Number.isInteger(record.sortOrder))
    ) {
      return undefined
    }
    rows.push({
      entityId: record.entityId,
      role:
        typeof record.role === 'string' ? record.role.slice(0, SCENE_ENTITY_ROLE_MAX) : undefined,
      sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : undefined
    })
  }
  return rows
}

/** 提取剧情线创建选项：undefined / null / 纯对象；只接受已认可字段。
 * 字符串透传（非法串由数据层白名单归一回默认）；非字符串标量视为畸形 → undefined（调用方回 null）。 */
function sanitizeLineOptions(value: unknown): CreatePlotLineOptions | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    !isOptionalString(record.lineType) ||
    !isOptionalString(record.lineColor) ||
    !isOptionalString(record.timelineId) ||
    !isOptionalString(record.defaultOrigin)
  ) {
    return undefined
  }
  const options: CreatePlotLineOptions = {}
  if (typeof record.lineType === 'string') options.lineType = record.lineType
  if (typeof record.lineColor === 'string') options.lineColor = record.lineColor
  if (typeof record.timelineId === 'string') options.timelineId = record.timelineId
  if (typeof record.defaultOrigin === 'string') options.defaultOrigin = record.defaultOrigin
  return options
}

/** 校验剧情线更新补丁：undefined / null / 纯对象；只保留已认可字段。
 * `name` 空白串透传（数据层视同未提供）；类型 / 颜色字符串透传、数据层归一。 */
function sanitizeLinePatch(value: unknown): UpdatePlotLinePatch | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    (record.name !== undefined && typeof record.name !== 'string') ||
    !isOptionalString(record.lineType) ||
    !isOptionalString(record.lineColor)
  ) {
    return undefined
  }
  const patch: UpdatePlotLinePatch = {}
  if (typeof record.name === 'string') patch.name = record.name
  if (typeof record.lineType === 'string') patch.lineType = record.lineType
  if (typeof record.lineColor === 'string') patch.lineColor = record.lineColor
  return patch
}

/** 校验场景创建入参：undefined / null 建空场景回空对象；仅非对象或字段非法回 undefined。 */
function sanitizeSceneInput(value: unknown): CreatePlotSceneInput | undefined {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    !isOptionalString(record.timeText) ||
    !isOptionalTimeEra(record.timeEra) ||
    !isOptionalTimeYear(record.timeYear) ||
    !isOptionalString(record.timeDesc) ||
    !isOptionalString(record.title) ||
    !isOptionalString(record.description) ||
    !isOptionalContentJson(record.descriptionJson)
  ) {
    return undefined
  }
  const input: CreatePlotSceneInput = {}
  if (typeof record.timeText === 'string') input.timeText = record.timeText
  if (typeof record.timeEra === 'string') input.timeEra = record.timeEra
  if (typeof record.timeYear === 'number') input.timeYear = record.timeYear
  if (record.timeYear === null) input.timeYear = null
  if (typeof record.timeDesc === 'string') input.timeDesc = record.timeDesc
  if (typeof record.title === 'string') input.title = record.title
  if (typeof record.description === 'string') input.description = record.description
  if (typeof record.descriptionJson === 'string') input.descriptionJson = record.descriptionJson
  if (record.descriptionJson === null) input.descriptionJson = null
  return input
}

/** 校验场景更新补丁：undefined / null / 纯对象；只保留已认可字段。 */
function sanitizeScenePatch(value: unknown): UpdatePlotScenePatch | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (
    !isOptionalString(record.timeText) ||
    !isOptionalTimeEra(record.timeEra) ||
    !isOptionalTimeYear(record.timeYear) ||
    !isOptionalString(record.timeDesc) ||
    !isOptionalString(record.title) ||
    !isOptionalString(record.description) ||
    !isOptionalContentJson(record.descriptionJson)
  ) {
    return undefined
  }
  const patch: UpdatePlotScenePatch = {}
  if (typeof record.timeText === 'string') patch.timeText = record.timeText
  if (typeof record.timeEra === 'string') patch.timeEra = record.timeEra
  if (typeof record.timeYear === 'number') patch.timeYear = record.timeYear
  if (record.timeYear === null) patch.timeYear = null
  if (typeof record.timeDesc === 'string') patch.timeDesc = record.timeDesc
  if (typeof record.title === 'string') patch.title = record.title
  if (typeof record.description === 'string') patch.description = record.description
  if (typeof record.descriptionJson === 'string') patch.descriptionJson = record.descriptionJson
  if (record.descriptionJson === null) patch.descriptionJson = null
  return patch
}

/**
 * 剧情域 IPC：通道前缀 `plot:`。剧情线 → 场景节点两级结构，不复用章节 / 大纲表。
 *
 * 通道 → 入参 / 出参（非法入参一律回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - plot:listLines   (bookId: string)                              → PlotLineRow[]（未删除）
 * - plot:listScenes  (bookId: string)                              → PlotSceneRow[]（未删除）
 * - plot:createLine  (bookId: string, name?: string, options?: { lineType?, lineColor? })
 *                                                                   → PlotLineRow | null（缺名 → 空串，展示层 i18n 兜底；类型 / 颜色非法 → 默认）
 * - plot:renameLine  (id: number, name: string)                   → PlotLineRow | null（name 须非空；兼容保留）
 * - plot:updateLine  (id: number, patch?: { name?, lineType?, lineColor? })
 *                                                                   → PlotLineRow | null（类型 / 颜色非法 → 默认）
 * - plot:deleteLine  (id: number)                                 → boolean（软删除，级联软删其下场景）
 * - plot:createScene (bookId: string, lineId: number, input?)     → PlotSceneRow | null
 * - plot:updateScene (id: number, patch?)                         → PlotSceneRow | null
 * - plot:deleteScene (id: number)                                 → boolean（软删除）
 * - plot:listSceneEntities (sceneId: number)                      → PlotSceneEntityRow[]
 * - plot:setSceneEntities  (sceneId: number, rows: Array<{ entityId, role?, sortOrder? }>)
 *                                                                   → PlotSceneEntityRow[] | null
 *   （整体替换该场景的手动关联设定；场景不存在 / 入参畸形 → null；非法实体 id 静默丢弃）
 *
 * 注：本模块不含 reorder / move（节点交互仅 CRUD，不做拖拽）。
 * 类型 / 颜色更新二选一已定：**新增 `plot:updateLine`**（`plot:renameLine` 兼容保留）。
 *
 * 场景正文（与大纲正文同口径）：`createScene` / `updateScene` 入参可带 `descriptionJson`
 * （整条块级 Tiptap JSON，`null` / 空串 = 空正文；非空须为合法 JSON，否则整包拒绝）；
 * 数据层据此派生纯文本摘要写入 `description`，两列恒同步；仅传纯文本 `description`
 * 时由数据层包成合法富文本文档（老接口 / 教学种子兼容）。
 */
export function registerPlotIpc(): void {
  ipcMain.handle('plot:listLines', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    // 懒回填：旧线缺类型 / 颜色（NULL / 空串 / 非白名单）回填默认（幂等，多次调用安全）。
    try {
      backfillPlotLineDefaults(bookId)
    } catch (error) {
      log.error('plot:listLines 回填失败', { bookId, error })
    }
    // 懒回填：旧线缺时间线归属（NULL / 空串）回填默认（幂等，多次调用安全）。
    try {
      backfillPlotLineTimeline(bookId)
    } catch (error) {
      log.error('plot:listLines 时间线回填失败', { bookId, error })
    }
    return listPlotLines(bookId)
  })

  ipcMain.handle('plot:listScenes', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listPlotScenes(bookId)
  })

  ipcMain.handle('plot:createLine', (_event, bookId: unknown, name: unknown, options: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return null
    if (name !== undefined && !isOptionalString(name)) return null
    const lineOptions = sanitizeLineOptions(options)
    if (lineOptions === undefined) return null
    return runWrite('plot:createLine', { bookId }, () =>
      createPlotLine(
        bookId,
        (name as string | null | undefined) ?? undefined,
        lineOptions ?? undefined
      )
    )
  })

  ipcMain.handle('plot:renameLine', (_event, id: unknown, name: unknown) => {
    if (!isPositiveInt(id) || !isNonEmptyString(name)) return null
    return runWrite('plot:renameLine', { id }, () => renamePlotLine(id, name))
  })

  ipcMain.handle('plot:updateLine', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const linePatch = sanitizeLinePatch(patch)
    if (linePatch === undefined) return null
    return runWrite('plot:updateLine', { id }, () => updatePlotLine(id, linePatch ?? {}))
  })

  ipcMain.handle('plot:deleteLine', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('plot:deleteLine', { id }, () => deletePlotLine(id))
  })

  ipcMain.handle('plot:createScene', (_event, bookId: unknown, lineId: unknown, input: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || !isPositiveInt(lineId)) {
      log.warn('plot:createScene 非法入参回 null', {
        bookIdType: typeof bookId,
        lineIdType: typeof lineId,
        lineId
      })
      return null
    }
    const sceneInput = sanitizeSceneInput(input)
    if (sceneInput === undefined) {
      log.warn('plot:createScene 场景入参消毒失败回 null', {
        bookId,
        lineId,
        inputType: typeof input
      })
      return null
    }
    return runWrite('plot:createScene', { bookId, lineId }, () =>
      createPlotScene(bookId, lineId, sceneInput ?? undefined)
    )
  })

  ipcMain.handle('plot:updateScene', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const scenePatch = sanitizeScenePatch(patch)
    if (scenePatch === undefined) return null
    return runWrite('plot:updateScene', { id }, () => updatePlotScene(id, scenePatch ?? {}))
  })

  ipcMain.handle('plot:deleteScene', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('plot:deleteScene', { id }, () => deletePlotScene(id))
  })

  ipcMain.handle('plot:listSceneEntities', (_event, sceneId: unknown) => {
    if (!isPositiveInt(sceneId)) return []
    return listPlotSceneEntities(sceneId)
  })

  ipcMain.handle('plot:setSceneEntities', (_event, sceneId: unknown, rows: unknown) => {
    if (!isPositiveInt(sceneId)) return null
    const parsed = sanitizeSceneEntityRows(rows)
    if (parsed === undefined) {
      log.warn('plot:setSceneEntities 入参消毒失败回 null', { sceneId })
      return null
    }
    return runWrite('plot:setSceneEntities', { sceneId, count: parsed.length }, () =>
      setPlotSceneEntities(sceneId, parsed)
    )
  })
}
