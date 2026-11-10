import { ipcMain } from 'electron'
import { logger } from '../logger'
import { isValidRichTextJson } from '../database/richText'
import {
  createOutlineGroup,
  createOutlineItem,
  createOutlineVolume,
  deleteOutlineItem,
  deleteOutlineVolume,
  getOutlineContent,
  getOutlineVolumeContent,
  listDeletedOutline,
  listOutlineItems,
  listOutlineVolumes,
  moveOutlineItem,
  purgeAllDeletedOutline,
  purgeOutlineItem,
  purgeOutlineVolume,
  renameOutlineItem,
  renameOutlineVolume,
  reorderOutlineItem,
  reorderOutlineVolume,
  restoreOutlineItem,
  restoreOutlineVolume,
  saveOutlineContent
} from '../database/outline'

/** 大纲域日志 scope。 */
const log = logger.scope('outline')

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

/** 校验排序序号：非负整数。 */
function isOrderIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** 校验非空字符串（去空白后）。 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** 校验可选字符串：undefined / null / 字符串。 */
function isOptionalString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string'
}

/**
 * 校验大纲正文 `contentJson`：`null` / 空串 = 清空正文；非空须为**合法 JSON 串**。
 *
 * 主进程复验一次 `JSON.parse`：数据层有 `CHECK json_valid` 守卫，但非法串穿到 SQLite
 * 会以底层约束错误抛出、污染正文写入链路（且报错信息不可读）。此处提前拦截，
 * 非法一律回退失败标记，避免脏数据落库。
 *
 * 实现委托公共模块 `database/richText`（§9：与剧情域共用同一校验）。
 */
function isValidContentJson(value: unknown): value is string | null {
  return isValidRichTextJson(value)
}

/**
 * 大纲域 IPC：通道前缀 `outline:`。复用章节域**统一卷池**（`volumes.kind ∈ ('normal','group')`），
 * 条目结构为 `outline_items`（无 `parent_id`；分组 = `kind='group'` 的卷行，其下条目挂 `volume_id`），
 * 正文**整条内联**在 `outline_items.content_json`。
 *
 * 通道 → 入参 / 出参（非法入参一律回退安全默认，不抛异常；数据层校验失败抛错原样上抛）：
 * - outline:listVolumes    (bookId: string)                     → OutlineVolumeRow[]（未删除；附 numberIndex）
 * - outline:list           (bookId: string)                     → OutlineItemRow[]（未删除 `scope='entry'`）
 * - outline:createVolume   (bookId: string, name?: string)      → OutlineVolumeRow | null（正文卷；缺名自动编号）
 * - outline:renameVolume   (id: number, name: string)           → OutlineVolumeRow | null（改 title 名段）
 * - outline:deleteVolume   (id: number)                         → boolean（软删除，级联软删其下条目 + 卷纲行）
 * - outline:reorderVolume  (id: number, index: number)          → boolean
 * - outline:create         (bookId: string, volumeId: number | null, title?: string) → OutlineItemRow | null
 *     （volumeId 为数字 = 挂到该书正文卷或分组卷（`kind ∈ ('normal','group')`）下；null = 独立条目，列表置顶）
 * - outline:createGroup    (bookId: string, title?: string)     → OutlineVolumeRow | null
 *     （创建分组容器：落一行 `volumes.kind='group'`，其下不产生条目行）
 * - outline:rename         (id: number, title: string)          → OutlineItemRow | null（改 title）
 * - outline:delete         (id: number)                         → boolean（软删除）
 * - outline:reorder        (id: number, index: number)          → boolean（同组内移动）
 * - outline:move           (id: number, volumeId: number)       → boolean（跨卷，移至目标卷末尾）
 * - outline:getContent     (itemId: number)                     → OutlineContentPayload | null（条目 / 卷纲通用）
 * - outline:getVolumeOutline (volumeId: number)                 → OutlineContentPayload | null（按卷 id 取卷纲行）
 * - outline:saveContent    (itemId: number, contentJson: string | null, text: string) → boolean
 *     （contentJson 非空须为合法 JSON；行不存在 / 已软删 → false）
 * - outline:listDeleted    (bookId: string)                     → DeletedOutlineContent（软删卷 / 未删收拢卷 + 软删条目）
 * - outline:restore        (id: number)                         → boolean（还原条目；父卷须存在且未删）
 * - outline:restoreVolume  (id: number)                         → boolean（还原卷及其下软删条目）
 * - outline:purge          (id: number)                         → boolean（彻底删除条目）
 * - outline:purgeVolume    (id: number)                         → boolean（彻底删除卷 + 其下条目）
 * - outline:purgeAllDeleted (bookId: string)                    → OutlinePurgeCounts（清空 normal/group 软删卷 + 残留条目）
 */
export function registerOutlineIpc(): void {
  ipcMain.handle('outline:listVolumes', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listOutlineVolumes(bookId)
  })

  ipcMain.handle('outline:list', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return []
    return listOutlineItems(bookId)
  })

  ipcMain.handle('outline:createVolume', (_event, bookId: unknown, name: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return null
    if (name !== undefined && !isOptionalString(name)) return null
    return runWrite('outline:createVolume', { bookId }, () =>
      createOutlineVolume(bookId, (name as string | null | undefined) ?? undefined)
    )
  })

  ipcMain.handle('outline:renameVolume', (_event, id: unknown, name: unknown) => {
    if (!isPositiveInt(id) || !isNonEmptyString(name)) return null
    return runWrite('outline:renameVolume', { id }, () => renameOutlineVolume(id, name))
  })

  ipcMain.handle('outline:deleteVolume', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('outline:deleteVolume', { id }, () => deleteOutlineVolume(id))
  })

  ipcMain.handle('outline:reorderVolume', (_event, id: unknown, index: unknown) => {
    if (!isPositiveInt(id) || !isOrderIndex(index)) return false
    return runWrite('outline:reorderVolume', { id, index }, () => reorderOutlineVolume(id, index))
  })

  ipcMain.handle('outline:create', (_event, bookId: unknown, volumeId: unknown, title: unknown) => {
    // volumeId 可为 null（独立条目，列表置顶）或正整数（须为该书未删除可见卷：正文卷 / 分组卷）。
    if (typeof bookId !== 'string' || bookId === '') return null
    if (volumeId !== null && !isPositiveInt(volumeId)) return null
    if (title !== undefined && typeof title !== 'string') return null
    return runWrite('outline:create', { bookId, volumeId }, () =>
      createOutlineItem(bookId, volumeId as number | null, title as string | undefined)
    )
  })

  ipcMain.handle('outline:createGroup', (_event, bookId: unknown, title: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return null
    if (title !== undefined && typeof title !== 'string') return null
    return runWrite('outline:createGroup', { bookId }, () =>
      createOutlineGroup(bookId, title as string | undefined)
    )
  })

  ipcMain.handle('outline:rename', (_event, id: unknown, title: unknown) => {
    if (!isPositiveInt(id) || typeof title !== 'string') return null
    return runWrite('outline:rename', { id }, () => renameOutlineItem(id, title))
  })

  ipcMain.handle('outline:delete', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('outline:delete', { id }, () => deleteOutlineItem(id))
  })

  ipcMain.handle('outline:reorder', (_event, id: unknown, index: unknown) => {
    if (!isPositiveInt(id) || !isOrderIndex(index)) return false
    return runWrite('outline:reorder', { id, index }, () => reorderOutlineItem(id, index))
  })

  ipcMain.handle('outline:move', (_event, id: unknown, volumeId: unknown) => {
    if (!isPositiveInt(id) || !isPositiveInt(volumeId)) return false
    return runWrite('outline:move', { id, volumeId }, () => moveOutlineItem(id, volumeId))
  })

  ipcMain.handle('outline:getContent', (_event, itemId: unknown) => {
    if (!isPositiveInt(itemId)) return null
    return getOutlineContent(itemId)
  })

  ipcMain.handle('outline:getVolumeOutline', (_event, volumeId: unknown) => {
    if (!isPositiveInt(volumeId)) return null
    return getOutlineVolumeContent(volumeId)
  })

  ipcMain.handle(
    'outline:saveContent',
    (_event, itemId: unknown, contentJson: unknown, text: unknown) => {
      if (!isPositiveInt(itemId) || !isValidContentJson(contentJson) || typeof text !== 'string') {
        log.warn('outline:saveContent 入参非法', {
          itemId,
          textLength: typeof text === 'string' ? text.length : typeof text
        })
        return false
      }
      return runWrite('outline:saveContent', { itemId }, () =>
        saveOutlineContent(itemId, contentJson, text)
      )
    }
  )

  ipcMain.handle('outline:listDeleted', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return { volumes: [], items: [] }
    return listDeletedOutline(bookId)
  })

  ipcMain.handle('outline:restore', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('outline:restore', { id }, () => restoreOutlineItem(id))
  })

  ipcMain.handle('outline:restoreVolume', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('outline:restoreVolume', { id }, () => restoreOutlineVolume(id))
  })

  ipcMain.handle('outline:purge', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('outline:purge', { id }, () => purgeOutlineItem(id))
  })

  ipcMain.handle('outline:purgeVolume', (_event, id: unknown) => {
    if (!isPositiveInt(id)) return false
    return runWrite('outline:purgeVolume', { id }, () => purgeOutlineVolume(id))
  })

  ipcMain.handle('outline:purgeAllDeleted', (_event, bookId: unknown) => {
    if (typeof bookId !== 'string' || bookId === '') return { volumes: 0, items: 0 }
    return runWrite('outline:purgeAllDeleted', { bookId }, () => purgeAllDeletedOutline(bookId))
  })
}
