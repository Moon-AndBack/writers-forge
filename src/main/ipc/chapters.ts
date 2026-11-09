import { ipcMain } from 'electron'
import { logger } from '../logger'
import { invalidateChapterSearchCache } from '../database/chapterSearch'
import { getParagraphs, saveParagraphs } from '../database/paragraphs'
import { recordDailyDelta } from '../database/stats'
import { MAX_DOC_CHARS, docEffectiveChars } from './docLimit'
import {
  CHAPTER_STATUSES,
  bookChapterStats,
  createChapter,
  createVolume,
  deleteChapter,
  deleteVolume,
  listChapters,
  listVolumes,
  moveChapter,
  renameChapter,
  renameVolume,
  reorderChapter,
  reorderVolume,
  setChapterPin,
  setChapterStatus
} from '../database/chapters'
import type {
  ChapterPin,
  ChapterStatus,
  CreateChapterInput,
  CreateVolumeInput,
  RenameChapterPatch
} from '../database/chapters'
import { nextChapterDefaultTitle, nextVolumeDefaultTitle } from '../database/chapterNaming'
import {
  listDeleted,
  purgeAllDeleted,
  purgeChapter,
  purgeVolume,
  restoreChapter,
  restoreVolume
} from '../database/chapterTrash'

/** 章节域日志 scope。 */
const log = logger.scope('chapters')

/**
 * 写操作包装：执行数据库写并统一记录成功（debug）/ 失败（error）。
 * 失败时原样抛出，不改变现有 IPC 语义。
 */
function runWrite<T>(channel: string, context: Record<string, unknown>, fn: () => T): T {
  try {
    const result = fn()
    // 章节结构写操作（增删改 / 重排 / 状态 / pin）可能影响搜索范围，成功后失效搜索缓存。
    invalidateChapterSearchCache()
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

/** 校验排序序号：非负整数。 */
function isOrderIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 校验章节状态枚举。 */
function isChapterStatus(value: unknown): value is ChapterStatus {
  return typeof value === 'string' && CHAPTER_STATUSES.includes(value as ChapterStatus)
}

/** 校验 pin 枚举（'top' | 'bottom'）。 */
function isChapterPin(value: unknown): value is ChapterPin {
  return value === 'top' || value === 'bottom'
}

/** 校验可选字符串：undefined / null / 字符串。 */
function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

/**
 * 创建章 IPC 入参：对外用 `isSpecial` 布尔表达章判别（渲染层「新建特殊章」按钮），
 * 与数据层 `CreateChapterInput` 的 `kind` 一一映射（`true` → `'special'`，否则 `'normal'`）。
 */
type CreateChapterIpcInput = Omit<CreateChapterInput, 'kind'> & { isSpecial?: boolean }

/**
 * 校验创建章入参（v2）。
 * - `volumeId` **必填**正整数（未分卷语义已移除）；
 * - 特殊章（`isSpecial === true`）：须有非空前段（specialPrefix）+ 非空名段（title 两段齐全）；
 * - 普通章：名段可空（自动编号）。
 */
function isCreateChapterInput(value: unknown): value is CreateChapterIpcInput {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  if (!isPositiveInt(input.volumeId)) return false
  if (input.title !== undefined && typeof input.title !== 'string') return false
  if (input.status !== undefined && !isChapterStatus(input.status)) return false
  if (input.isSpecial !== undefined && typeof input.isSpecial !== 'boolean') return false
  if (input.specialPrefix !== undefined && !isOptionalString(input.specialPrefix)) return false
  if (input.pin !== undefined && !isChapterPin(input.pin)) return false
  if (input.isSpecial === true) {
    if (!isNonEmptyString(input.specialPrefix)) return false
    if (!isNonEmptyString(input.title)) return false
  }
  return true
}

/**
 * 校验创建卷入参：`kind` 仅允许 `'custom'` / `'normal'`（章节页可见卷；`group` 分组容器
 * 由大纲域 `outline:createGroup` 创建，不经本通道）；`title` 缺省或字符串
 * （`custom` 语义上必填由渲染层保证，数据层缺名兜底回落「卷X」）。
 */
function isCreateVolumeInput(value: unknown): value is CreateVolumeInput {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  if (input.kind !== undefined && input.kind !== 'custom' && input.kind !== 'normal') return false
  if (input.title !== undefined && typeof input.title !== 'string') return false
  return true
}

/**
 * 校验重命名章补丁（v2）：`title` 必填字符串（可为空串 = 无自定义名）；
 * **`kind` 仅允许缺省或 `'special'`**（`'normal'` = 特殊章转普通，运行时拒绝）；
 * `specialPrefix` 仅特殊章生效。
 */
function isRenameChapterPatch(value: unknown): value is RenameChapterPatch {
  if (typeof value !== 'object' || value === null) return false
  const input = value as Record<string, unknown>
  if (typeof input.title !== 'string') return false
  if (input.kind !== undefined && input.kind !== 'normal' && input.kind !== 'special') return false
  if (input.kind === 'normal') return false
  if (input.specialPrefix !== undefined && !isOptionalString(input.specialPrefix)) return false
  return true
}

/**
 * 校验段落写入项：`text` 必为 string；`contentJson` 缺省或 null = 纯文本段，
 * 非空须为 string（JSON 合法性由渲染层序列化保证，读侧另有损坏降级）。
 */
function isParagraphInputArray(
  value: unknown
): value is Array<{ text: string; contentJson?: string | null }> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { text?: unknown }).text === 'string' &&
        ((item as { contentJson?: unknown }).contentJson === undefined ||
          (item as { contentJson?: unknown }).contentJson === null ||
          typeof (item as { contentJson?: unknown }).contentJson === 'string')
    )
  )
}

/**
 * 章节域 IPC（v2）：通道前缀 `chapters:`。
 *
 * 通道 → 入参 / 出参（非法入参一律回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - chapters:listVolumes      (bookId: string)                → VolumeRow[]（未删除；附 numberIndex）
 * - chapters:list             (bookId: string)                → ChapterRow[]（未删除，组内 pin 段序；附 numberIndex）
 * - chapters:createVolume     (bookId: string, input: { kind?: 'custom'|'normal', title?: string }) → VolumeRow | null
 *     （同事务建卷纲行；`kind` 缺省 `normal` 自动「卷X」）
 * - chapters:renameVolume     (id: number, title: string)     → VolumeRow | null（仅写名段；空白归空串）
 * - chapters:deleteVolume     (id: number)                    → boolean（软删除，整卷入回收站）
 * - chapters:reorderVolume    (id: number, index: number)     → boolean
 * - chapters:create           (bookId: string, input: { volumeId, title?, status?, isSpecial?, specialPrefix?, pin? }) → ChapterRow | null
 *     （volumeId 必填；特殊章须前段 + 名段；`isSpecial` 对外映射数据层 `kind`；
 *     特殊章 `pin` 缺省置顶 `'top'`，普通章恒 `null`）
 * - chapters:rename           (id: number, patch: { title, kind?, specialPrefix? }) → ChapterRow | null（kind:'normal' 拒绝）
 * - chapters:setPin           (id: number, 'top'|'bottom')    → ChapterRow | null（仅特殊章）
 * - chapters:setStatus        (id: number, status)            → ChapterRow | null（两态：draft/done，非法 → null）
 * - chapters:delete           (id: number)                    → boolean（软删除）
 * - chapters:reorder          (id: number, index: number)     → boolean（同卷同 pin 段内移动）
 * - chapters:move             (id: number, volumeId: number)  → boolean（跨卷；volumeId 必填）
 * - chapters:getParagraphs    (chapterId: number)             → ParagraphRow[]（非法入参回退 []）
 * - chapters:saveParagraphs   (chapterId: number, paragraphs: { text, contentJson? }[]) → { ok, count? }
 *     （超单篇上限 / 入参非法 / 章不存在 → { ok: false }）
 * - chapters:stats            (bookId: string)                → ChapterStats（排除软删；非法 → {0,0}）
 * - chapters:nextVolumeTitle  (bookId: string)                → string（下一个默认卷名）
 * - chapters:nextChapterTitle (bookId: string, volumeId)      → string（下一个默认章名；达上限返回空串）
 * - chapters:listDeleted      (bookId: string)                → DeletedContent（只列软删章）
 * - chapters:restore          (id: number)                    → boolean（还原章）
 * - chapters:restoreVolume    (id: number)                    → boolean（还原卷及其下软删章）
 * - chapters:purge            (id: number)                    → boolean（彻底删章 + 段落级联）
 * - chapters:purgeVolume      (id: number)                    → boolean（彻底删卷 + 其下章 + 段落）
 * - chapters:purgeAllDeleted  (bookId: string)                → PurgeCounts（清空章节回收站：只删章）
 */
export function registerChaptersIpc(): void {
  ipcMain.handle('chapters:listVolumes', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listVolumes(bookId)
  })

  ipcMain.handle('chapters:list', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listChapters(bookId)
  })

  ipcMain.handle('chapters:createVolume', (_event, bookId: unknown, input: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return null
    if (!isCreateVolumeInput(input)) return null
    return runWrite('chapters:createVolume', { bookId }, () => createVolume(bookId, input))
  })

  ipcMain.handle('chapters:renameVolume', (_event, id: unknown, title: unknown) => {
    if (!isPositiveInt(id) || typeof title !== 'string') return null
    return runWrite('chapters:renameVolume', { id }, () => renameVolume(id, title))
  })

  ipcMain.handle('chapters:deleteVolume', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('chapters:deleteVolume', { id }, () => deleteVolume(id))
  })

  ipcMain.handle('chapters:reorderVolume', (_event, id: unknown, index: unknown) => {
    if (!isPositiveInt(id) || !isOrderIndex(index)) return false
    return runWrite('chapters:reorderVolume', { id, index }, () => reorderVolume(id, index))
  })

  ipcMain.handle('chapters:create', (_event, bookId: unknown, input: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || !isCreateChapterInput(input)) return null
    // 对外 `isSpecial` 布尔 → 数据层 `kind` 判别（'special' | 'normal'）。
    const mapped: CreateChapterInput = {
      volumeId: input.volumeId,
      title: input.title,
      status: input.status,
      specialPrefix: input.specialPrefix,
      pin: input.pin,
      kind: input.isSpecial === true ? 'special' : 'normal'
    }
    return runWrite('chapters:create', { bookId }, () => createChapter(bookId, mapped))
  })

  ipcMain.handle('chapters:rename', (_event, id: unknown, patch: unknown) => {
    if (!isPositiveInt(id) || !isRenameChapterPatch(patch)) return null
    return runWrite('chapters:rename', { id }, () => renameChapter(id, patch))
  })

  ipcMain.handle('chapters:setPin', (_event, id: unknown, pin: unknown) => {
    if (!isPositiveInt(id) || !isChapterPin(pin)) return null
    return runWrite('chapters:setPin', { id, pin }, () => setChapterPin(id, pin))
  })

  ipcMain.handle('chapters:setStatus', (_event, id: unknown, status: unknown) => {
    if (!isPositiveInt(id) || !isChapterStatus(status)) return null
    return runWrite('chapters:setStatus', { id, status }, () => setChapterStatus(id, status))
  })

  ipcMain.handle('chapters:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('chapters:delete', { id }, () => deleteChapter(id))
  })

  ipcMain.handle('chapters:reorder', (_event, id: unknown, index: unknown) => {
    if (!isPositiveInt(id) || !isOrderIndex(index)) return false
    return runWrite('chapters:reorder', { id, index }, () => reorderChapter(id, index))
  })

  ipcMain.handle('chapters:move', (_event, id: unknown, volumeId: unknown) => {
    if (!isPositiveInt(id) || !isPositiveInt(volumeId)) return false
    return runWrite('chapters:move', { id, volumeId }, () => moveChapter(id, volumeId))
  })

  ipcMain.handle('chapters:getParagraphs', (_event, chapterId: unknown) => {
    if (!isPositiveInt(chapterId)) return []
    return getParagraphs(chapterId)
  })

  ipcMain.handle('chapters:saveParagraphs', (_event, chapterId: unknown, paragraphs: unknown) => {
    if (!isPositiveInt(chapterId) || !isParagraphInputArray(paragraphs)) {
      log.warn('chapters:saveParagraphs 入参非法', {
        chapterId,
        paragraphCount: Array.isArray(paragraphs) ? paragraphs.length : typeof paragraphs
      })
      return { ok: false }
    }
    // 单篇正文上限（有效字数口径）：超限拒绝写入（渲染层输入拦截之外的主进程兜底）。
    if (docEffectiveChars(paragraphs.map((item) => item.text)) > MAX_DOC_CHARS) {
      log.warn('chapters:saveParagraphs 超出单篇上限', { chapterId, limit: MAX_DOC_CHARS })
      return { ok: false }
    }
    try {
      // 差量口径：先取该章保存前的有效字数，保存成功后按「后 − 前」累加到当日。
      // 字数只看 text（marks 为格式 JSON，不参与统计）。
      const before = docEffectiveChars(getParagraphs(chapterId).map((row) => row.text))
      const count = saveParagraphs(chapterId, paragraphs)
      const delta = recordDailyDelta(
        before,
        paragraphs.map((item) => item.text)
      )
      // 正文变更后失效章节搜索缓存（下次搜索重扫）。
      invalidateChapterSearchCache()
      log.debug('chapters:saveParagraphs 成功', { chapterId, count, delta })
      return { ok: true, count }
    } catch (error) {
      // 章不存在（外键失败）等情况：返回失败标记，不向渲染层抛异常。
      log.warn('chapters:saveParagraphs 失败（章不存在 / 外键约束）', {
        chapterId,
        textCount: paragraphs.length,
        error
      })
      return { ok: false }
    }
  })

  ipcMain.handle('chapters:stats', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return { chapters: 0, words: 0 }
    return bookChapterStats(bookId)
  })

  ipcMain.handle('chapters:nextVolumeTitle', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return ''
    return nextVolumeDefaultTitle(bookId)
  })

  ipcMain.handle('chapters:nextChapterTitle', (_event, bookId: unknown, volumeId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '' || !isPositiveInt(volumeId)) return ''
    return nextChapterDefaultTitle(bookId, volumeId)
  })

  ipcMain.handle('chapters:listDeleted', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return { chapters: [] }
    return listDeleted(bookId)
  })

  ipcMain.handle('chapters:restore', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('chapters:restore', { id }, () => restoreChapter(id))
  })

  ipcMain.handle('chapters:restoreVolume', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('chapters:restoreVolume', { id }, () => restoreVolume(id))
  })

  ipcMain.handle('chapters:purge', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('chapters:purge', { id }, () => purgeChapter(id))
  })

  ipcMain.handle('chapters:purgeVolume', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('chapters:purgeVolume', { id }, () => purgeVolume(id))
  })

  ipcMain.handle('chapters:purgeAllDeleted', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return { chapters: 0 }
    return runWrite('chapters:purgeAllDeleted', { bookId }, () => purgeAllDeleted(bookId))
  })
}
