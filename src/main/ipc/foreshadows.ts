import { ipcMain } from 'electron'
import { logger } from '../logger'
import { isValidRichTextJson } from '../database/richText'
import {
  attachForeshadowAnchor,
  createForeshadow,
  deleteForeshadow,
  setForeshadowAbandoned,
  updateForeshadow,
  type ForeshadowAnchor,
  type ForeshadowAnchorKind,
  type ForeshadowBodyAnchor,
  type ForeshadowCreatePayload,
  type ForeshadowNoAnchor,
  type ForeshadowOutlineAnchor,
  type ForeshadowStatus,
  type ForeshadowUpdatePatch
} from '../database/foreshadows'
import {
  clearForeshadowBodyAnchor,
  clearForeshadowOutlineAnchor,
  clearForeshadowRecoverAnchor
} from '../database/foreshadowsClear'
import {
  getForeshadow,
  listForeshadows,
  listForeshadowsByChapter,
  listForeshadowsByOutlineItem,
  listForeshadowsByRecoverAnchorChapter,
  listForeshadowsByRecoverAnchorOutlineItem,
  type ForeshadowAnchorHit
} from '../database/foreshadowsQuery'

/** 伏笔域日志 scope。 */
const log = logger.scope('foreshadow')

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

/** 校验可选非负整数：undefined / null / 0 以上整数。 */
function isOptionalIndex(value: unknown): value is number | null | undefined {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= 0)
  )
}

/** 校验可选正整数 id：undefined / null / 正整数。 */
function isOptionalPositiveInt(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isPositiveInt(value)
}

/**
 * 伏笔富文本描述 JSON 串长度上限（字符数）。
 *
 * 依据：对齐 `ipc/docLimit.ts` 的单篇正文上限 `MAX_DOC_CHARS = 200_000`（有效字数）；
 * 块级 Tiptap JSON 因节点 / 属性冗余，体量约为纯文本的 2–3 倍，20 万字符（≈200KB）
 * 足以覆盖上限内正文。超长视为异常入参，丢弃该字段而非整包拒绝。
 */
const DESCRIPTION_JSON_MAX_CHARS = 200_000

/**
 * 消毒富文本描述入参：`undefined`（未提供）/ `null`（清空）原样返回；字符串须为**合法
 * JSON** 且不超长，否则返回 `undefined` —— 由调用方**丢弃该字段**（不报错、不整包拒绝，
 * 保留纯文本 `description` 兼容路径）。空串按 `isValidRichTextJson` 规则视为合法（= 清空）。
 */
function sanitizeDescriptionJson(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'string' || value.length > DESCRIPTION_JSON_MAX_CHARS) return undefined
  return isValidRichTextJson(value) ? value : undefined
}

const FORESHADOW_STATUSES: readonly string[] = ['planted', 'recovered', 'abandoned']
/** 回收点锚点仍为三态（章节 / 大纲条目 / 未记录）。 */
const FORESHADOW_ANCHOR_KINDS: readonly string[] = ['chapter', 'outline', 'none']
/** 正文埋点只接受章节锚点。 */
const BODY_ANCHOR_KINDS: readonly string[] = ['chapter', 'none']
/** 大纲埋点只接受大纲条目锚点。 */
const OUTLINE_ANCHOR_KINDS: readonly string[] = ['outline', 'none']
/** 关联伏笔：只接受真实锚点（`none` 无意义，拒为 `invalid`）。 */
const ATTACH_ANCHOR_KINDS: readonly string[] = ['chapter', 'outline']

function isForeshadowStatus(value: unknown): value is ForeshadowStatus {
  return typeof value === 'string' && FORESHADOW_STATUSES.includes(value)
}

function isAnchorKindOf(value: unknown, allowed: readonly string[]): value is ForeshadowAnchorKind {
  return typeof value === 'string' && allowed.includes(value)
}

/**
 * 消毒锚点入参：undefined / null 原样返回；纯对象且字段类型合法 → 归一化对象；
 * 畸形 / `kind` 不在 `allowed` 集合 → undefined（调用方整包拒绝）。
 * 语义约束（目标是否同书）由数据层校验；槽位归属由 `allowed` 收窄：
 * 正文埋点只认 `chapter`、大纲埋点只认 `outline`、回收点三态皆可。
 */
function sanitizeAnchor(
  value: unknown,
  allowed: readonly string[]
): ForeshadowAnchor | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (!isAnchorKindOf(record.kind, allowed)) return undefined
  if (
    !isOptionalPositiveInt(record.chapterId) ||
    !isOptionalPositiveInt(record.outlineItemId) ||
    !isOptionalIndex(record.paragraphIdx) ||
    !isOptionalIndex(record.charStart) ||
    !isOptionalIndex(record.charEnd) ||
    (record.quote !== undefined && typeof record.quote !== 'string')
  ) {
    return undefined
  }
  if (record.kind === 'chapter') {
    // 正文埋点：`chapterId` 必填（缺失直接拒，不再下抛到数据层）。
    if (!isPositiveInt(record.chapterId)) return undefined
    const anchor: ForeshadowBodyAnchor = { kind: 'chapter', chapterId: record.chapterId }
    if (typeof record.paragraphIdx === 'number') anchor.paragraphIdx = record.paragraphIdx
    if (record.paragraphIdx === null) anchor.paragraphIdx = null
    if (typeof record.quote === 'string') anchor.quote = record.quote
    if (typeof record.charStart === 'number') anchor.charStart = record.charStart
    if (record.charStart === null) anchor.charStart = null
    if (typeof record.charEnd === 'number') anchor.charEnd = record.charEnd
    if (record.charEnd === null) anchor.charEnd = null
    return anchor
  }
  if (record.kind === 'outline') {
    // 大纲埋点：`outlineItemId` 必填。
    if (!isPositiveInt(record.outlineItemId)) return undefined
    const anchor: ForeshadowOutlineAnchor = {
      kind: 'outline',
      outlineItemId: record.outlineItemId
    }
    if (typeof record.paragraphIdx === 'number') anchor.paragraphIdx = record.paragraphIdx
    if (record.paragraphIdx === null) anchor.paragraphIdx = null
    if (typeof record.quote === 'string') anchor.quote = record.quote
    if (typeof record.charStart === 'number') anchor.charStart = record.charStart
    if (record.charStart === null) anchor.charStart = null
    if (typeof record.charEnd === 'number') anchor.charEnd = record.charEnd
    if (record.charEnd === null) anchor.charEnd = null
    return anchor
  }
  return { kind: 'none' }
}

/** 正文埋点锚点消毒：`kind` 只允许 `chapter` / `none`。 */
function sanitizeBodyAnchor(
  value: unknown
): ForeshadowBodyAnchor | ForeshadowNoAnchor | null | undefined {
  const anchor = sanitizeAnchor(value, BODY_ANCHOR_KINDS)
  if (anchor === undefined || anchor === null) return anchor
  return anchor.kind === 'outline' ? undefined : anchor
}

/** 大纲埋点锚点消毒：`kind` 只允许 `outline` / `none`。 */
function sanitizeOutlineAnchor(
  value: unknown
): ForeshadowOutlineAnchor | ForeshadowNoAnchor | null | undefined {
  const anchor = sanitizeAnchor(value, OUTLINE_ANCHOR_KINDS)
  if (anchor === undefined || anchor === null) return anchor
  return anchor.kind === 'chapter' ? undefined : anchor
}

/** 消毒创建入参：标题须非空；其余字段可选，畸形 → undefined。 */
function sanitizeCreatePayload(value: unknown): ForeshadowCreatePayload | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (!isNonEmptyString(record.title)) return undefined
  if (record.description !== undefined && typeof record.description !== 'string') return undefined
  if (record.status !== undefined && !isForeshadowStatus(record.status)) return undefined
  const anchor = sanitizeBodyAnchor(record.anchor)
  if (record.anchor !== undefined && anchor === undefined) return undefined
  const anchor2 = sanitizeOutlineAnchor(record.anchor2)
  if (record.anchor2 !== undefined && anchor2 === undefined) return undefined
  // 富文本描述：畸形 / 超长只丢该字段，不影响其余入参（纯文本 description 仍可用）。
  const descriptionJson = sanitizeDescriptionJson(record.descriptionJson)
  const payload: ForeshadowCreatePayload = { title: record.title }
  if (typeof record.description === 'string') payload.description = record.description
  if (descriptionJson !== undefined) payload.descriptionJson = descriptionJson
  if (isForeshadowStatus(record.status)) payload.status = record.status
  if (anchor !== undefined && anchor !== null) payload.anchor = anchor
  if (anchor2 !== undefined && anchor2 !== null) payload.anchor2 = anchor2
  return payload
}

/** 消毒更新补丁：字段缺省不变；`anchor` / `anchor2` / `recoverAnchor` 为 null 清除对应锚点；畸形 → undefined。 */
function sanitizeUpdatePatch(value: unknown): ForeshadowUpdatePatch | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (record.title !== undefined && !isNonEmptyString(record.title)) return undefined
  if (record.description !== undefined && typeof record.description !== 'string') return undefined
  if (record.recoveryNote !== undefined && typeof record.recoveryNote !== 'string') return undefined
  const anchor = sanitizeBodyAnchor(record.anchor)
  if (record.anchor !== undefined && anchor === undefined) return undefined
  const anchor2 = sanitizeOutlineAnchor(record.anchor2)
  if (record.anchor2 !== undefined && anchor2 === undefined) return undefined
  const recoverAnchor = sanitizeAnchor(record.recoverAnchor, FORESHADOW_ANCHOR_KINDS)
  if (record.recoverAnchor !== undefined && recoverAnchor === undefined) return undefined
  // 富文本描述：畸形 / 超长只丢该字段（不整包拒绝）。
  const descriptionJson = sanitizeDescriptionJson(record.descriptionJson)
  const patch: ForeshadowUpdatePatch = {}
  if (typeof record.title === 'string') patch.title = record.title
  if (typeof record.description === 'string') patch.description = record.description
  if (descriptionJson !== undefined) patch.descriptionJson = descriptionJson
  if (typeof record.recoveryNote === 'string') patch.recoveryNote = record.recoveryNote
  if (record.anchor !== undefined) patch.anchor = anchor ?? null
  if (record.anchor2 !== undefined) patch.anchor2 = anchor2 ?? null
  if (record.recoverAnchor !== undefined) patch.recoverAnchor = recoverAnchor ?? null
  return patch
}

/** 锚点反查命中（正文埋点 / 大纲埋点）：chapterId 优先；两者都非法 → 空数组。 */
function resolveAnchorHits(chapterId: unknown, outlineItemId: unknown): ForeshadowAnchorHit[] {
  if (isPositiveInt(chapterId)) return listForeshadowsByChapter(chapterId)
  if (isPositiveInt(outlineItemId)) return listForeshadowsByOutlineItem(outlineItemId)
  return []
}

/**
 * 伏笔域 IPC：通道前缀 `foreshadow:`。锚点存快照（章 / 大纲条目 + 段落序号 + 原文摘录
 * + 段内字符区间），**不存 `paragraph_id`**（段落每次保存 id 全变）。
 *
 * 两个埋点槽位**语义固定**：`anchor` = 正文埋点（`body_*`，只收章节锚点）、
 * `anchor2` = 大纲埋点（`outline_*`，只收大纲条目锚点）；跨类型入参在消毒层即拒绝。
 *
 * 通道 → 入参 / 出参（非法入参一律回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - foreshadow:list         (bookId: string)                       → ForeshadowRow[]（`updated_at DESC`）
 * - foreshadow:get          (id: number)                           → ForeshadowRow | null
 * - foreshadow:create       (bookId: string, payload: { title, description?, descriptionJson?,
 *                            status?, anchor?: { kind: 'chapter', chapterId, paragraphIdx?,
 *                            quote?, charStart?, charEnd? },
 *                            anchor2?: { kind: 'outline', outlineItemId, … } })
 *                                                                   → ForeshadowRow | null
 * - foreshadow:update       (id: number, patch?: { title?, description?, descriptionJson?,
 *                            recoveryNote?, anchor?: … | null, anchor2?: … | null,
 *                            recoverAnchor?: … | null })         → ForeshadowRow | null
 *   （状态不在此通道写入：废弃 / 恢复走 `foreshadow:setAbandoned`，回收由回收点派生）
 * - foreshadow:delete       (id: number)                           → boolean（永久删除）
 * - foreshadow:attachAnchor (id: number, anchor: { kind, … })      → AttachForeshadowAnchorResult
 *   （按锚点 `kind` 补对应槽位：目标槽位已占用 → `full`，`none` / 畸形 → `invalid`，
 *    不存在 → `notFound`；以 `{ ok: false, reason }` 返回，不抛错）
 * - foreshadow:clearBodyAnchor    (id: number)                     → ClearForeshadowAnchorResult
 * - foreshadow:clearOutlineAnchor (id: number)                     → ClearForeshadowAnchorResult
 * - foreshadow:clearRecoverAnchor (id: number)                     → ForeshadowRow | null
 *   （清空正文埋点 / 大纲埋点 / 回收点：对应 `kind` 置 `none`、其余列置空，刷新 `updated_at`；
 *    已回收的伏笔不可移除埋点 → `{ ok: false, reason: 'recovered' }`，不存在 → `notFound`；
 *    回收点自身不受限——撤销回收后即可移除埋点）
 * - foreshadow:setAbandoned (id: number, abandoned: boolean)       → SetForeshadowAbandonedResult
 *   （废弃 toggle：`true` 置 `'abandoned'`、`false` 恢复 `'planted'`；有回收点的行
 *    拒绝废弃 → `{ ok: false, reason: 'recovered' }`；畸形入参 → `invalid`）
 * - foreshadow:listByAnchor (chapterId?: number, outlineItemId?: number) → ForeshadowRow[]
 *   （兼容通道：章节反查命中正文埋点、大纲反查命中大纲埋点；
 *    两者都给时优先 chapterId；都非法 → 空数组）
 * - foreshadow:listByAnchorHit (chapterId?: number, outlineItemId?: number)
 *   → ForeshadowAnchorHit[]（同上匹配，并回传 `slot`（`body` / `outline`），
 *    供标记层按槽位取快照字段）
 * - foreshadow:listByRecoverAnchor (chapterId?: number, outlineItemId?: number) → ForeshadowRow[]
 *   （**回收点**锚点反查；独立通道而非给 listByAnchor 加参数：正文里埋设处与回收处是
 *    两套互不替代的标记，调用方通常只查其中一类，独立通道语义清晰、无判别参数）
 */
export function registerForeshadowsIpc(): void {
  ipcMain.handle('foreshadow:list', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listForeshadows(bookId)
  })

  ipcMain.handle('foreshadow:get', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return null
    return getForeshadow(id)
  })

  ipcMain.handle('foreshadow:create', (_event, bookId: unknown, payload: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return null
    const parsed = sanitizeCreatePayload(payload)
    if (parsed === undefined) {
      log.warn('foreshadow:create 入参消毒失败回 null', { bookId })
      return null
    }
    return runWrite('foreshadow:create', { bookId }, () => createForeshadow(bookId, parsed))
  })

  ipcMain.handle('foreshadow:update', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id)) return null
    const parsed = sanitizeUpdatePatch(patch)
    if (parsed === undefined) {
      log.warn('foreshadow:update 入参消毒失败回 null', { id })
      return null
    }
    return runWrite('foreshadow:update', { id }, () => updateForeshadow(id, parsed))
  })

  ipcMain.handle('foreshadow:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('foreshadow:delete', { id }, () => deleteForeshadow(id))
  })

  ipcMain.handle('foreshadow:attachAnchor', (_event, id: unknown, anchor: unknown) => {
    if (!isPositiveInt(id)) return { ok: false, reason: 'invalid' }
    const parsed = sanitizeAnchor(anchor, ATTACH_ANCHOR_KINDS)
    if (parsed === undefined || parsed === null || parsed.kind === 'none') {
      log.warn('foreshadow:attachAnchor 入参消毒失败回 invalid', { id })
      return { ok: false, reason: 'invalid' }
    }
    return runWrite('foreshadow:attachAnchor', { id }, () => attachForeshadowAnchor(id, parsed))
  })

  ipcMain.handle('foreshadow:clearBodyAnchor', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return { ok: false, reason: 'notFound' }
    return runWrite('foreshadow:clearBodyAnchor', { id }, () => clearForeshadowBodyAnchor(id))
  })

  ipcMain.handle('foreshadow:clearOutlineAnchor', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return { ok: false, reason: 'notFound' }
    return runWrite('foreshadow:clearOutlineAnchor', { id }, () => clearForeshadowOutlineAnchor(id))
  })

  ipcMain.handle('foreshadow:clearRecoverAnchor', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return null
    return runWrite('foreshadow:clearRecoverAnchor', { id }, () => clearForeshadowRecoverAnchor(id))
  })

  ipcMain.handle('foreshadow:setAbandoned', (_event, id: unknown, abandoned: unknown) => {
    if (!isPositiveInt(id) || typeof abandoned !== 'boolean') {
      log.warn('foreshadow:setAbandoned 入参消毒失败回 invalid', { id })
      return { ok: false, reason: 'invalid' }
    }
    return runWrite('foreshadow:setAbandoned', { id, abandoned }, () =>
      setForeshadowAbandoned(id, abandoned)
    )
  })

  ipcMain.handle(
    'foreshadow:listByAnchor',
    (_event, chapterId: unknown, outlineItemId: unknown) => {
      // 兼容通道：语义固定后章节反查只命中正文埋点、大纲反查只命中大纲埋点，
      // 故不再按槽位过滤（渲染层已改用 `listByAnchorHit`）。
      return resolveAnchorHits(chapterId, outlineItemId).map((hit) => hit.row)
    }
  )

  ipcMain.handle(
    'foreshadow:listByAnchorHit',
    (_event, chapterId: unknown, outlineItemId: unknown) =>
      resolveAnchorHits(chapterId, outlineItemId)
  )

  ipcMain.handle(
    'foreshadow:listByRecoverAnchor',
    (_event, chapterId: unknown, outlineItemId: unknown) => {
      if (isPositiveInt(chapterId)) return listForeshadowsByRecoverAnchorChapter(chapterId)
      if (isPositiveInt(outlineItemId)) {
        return listForeshadowsByRecoverAnchorOutlineItem(outlineItemId)
      }
      return []
    }
  )
}
