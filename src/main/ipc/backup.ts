import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from 'electron'
import { rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { logger } from '../logger'
import { isBackupRunning } from '../onedrive/backup'
import { safeError, safePath } from '../onedrive/logSafe'
import {
  buildBackupFileName,
  createLocalBackup,
  finishBackupJob,
  getBackupDir,
  isRestoreRunning,
  listBackups,
  renameBackup,
  resolveBackupFolder,
  restoreDatabase,
  SNAPSHOT_FILE_NAME,
  tryStartBackupJob
} from '../backup'
import { getDatabasePath, getDb } from '../database'
import type {
  BackupCreateResult,
  BackupExportResult,
  BackupListResult,
  BackupOkResult,
  BackupRenameResult,
  BackupRestoreResult
} from '../backup'

/**
 * 本地备份 / 恢复 IPC（通道前缀 `backup:`）。
 *
 * 通道：
 * - backup:list        ()                        → { ok, items }（createdAt 倒序）
 * - backup:create      ()                        → { ok, item } / { ok:false, code }
 * - backup:restore     ({ folder })              → { ok, safeCopyPath } / { ok:false, code }
 * - backup:restoreFile ()                        → 主进程弹打开对话框后走同一恢复流程
 * - backup:export      ()                        → 主进程弹保存对话框，导出整库 .db
 * - backup:openFolder  ()                        → 打开备份目录
 * - backup:rename      ({ folder, name })        → { ok, item } / { ok:false, code }
 * - backup:delete      ({ folder })              → 删除整个备份文件夹
 *
 * 恢复成功后**先返回结果**，再用 300ms 延时 `app.relaunch()` + `app.exit(0)`，
 * 保证 IPC 响应先回到渲染层。可预期错误一律返回 `{ ok:false, code }`，
 * 只有非域内的意外异常才记日志后重抛。
 */

const log = logger.scope('backup:ipc')

/** 恢复成功到重启之间的延时（ms）：确保 IPC 响应先送达渲染层。 */
const RELAUNCH_DELAY_MS = 300

/** 从 `{ folder }` 载荷读取备份文件夹名；非法返回 null。 */
function readBackupFolder(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { folder } = payload as Record<string, unknown>
  return typeof folder === 'string' ? folder : null
}

/** 从 `{ folder, name }` 载荷读取重命名入参；非法返回 null。 */
function readRenamePayload(payload: unknown): { folder: string; name: string } | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { folder, name } = payload as Record<string, unknown>
  if (typeof folder !== 'string' || typeof name !== 'string') return null
  return { folder, name }
}

/** 取发起调用的窗口作为对话框父窗口（窗口已销毁时为 null）。 */
function senderWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/** 恢复成功后安排重启（结果先返回，再退出当前进程）。 */
function scheduleRelaunch(result: BackupRestoreResult): BackupRestoreResult {
  if (!result.ok) return result

  setTimeout(() => {
    log.info('数据库已恢复，重启应用')
    app.relaunch()
    app.exit(0)
  }, RELAUNCH_DELAY_MS)
  return result
}

/** 注册本地备份 / 恢复域 IPC。 */
export function registerBackupIpc(): void {
  ipcMain.handle('backup:list', async (): Promise<BackupListResult> => {
    try {
      const items = await listBackups()
      log.debug('backup:list 完成', { count: items.length })
      return { ok: true, items }
    } catch (error) {
      log.error('backup:list 失败', { error: safeError(error) })
      return { ok: false, code: 'list_failed' }
    }
  })

  ipcMain.handle('backup:create', async (): Promise<BackupCreateResult> => {
    if (isBackupRunning() || !tryStartBackupJob('create')) {
      log.warn('backup:create 重复调用（已有任务进行中）')
      return { ok: false, code: 'backup_in_progress' }
    }

    try {
      const result = await createLocalBackup()
      if (result.ok) {
        log.info('backup:create 完成', { folder: result.item.folder })
      } else {
        log.warn('backup:create 失败', { code: result.code })
      }
      return result
    } finally {
      finishBackupJob()
    }
  })

  ipcMain.handle(
    'backup:restore',
    async (_event, payload: unknown): Promise<BackupRestoreResult> => {
      const folder = readBackupFolder(payload)
      if (folder === null) {
        log.warn('backup:restore 入参非法')
        return { ok: false, code: 'invalid_name' }
      }

      const guarded = resolveBackupFolder(folder)
      if (!guarded.ok) {
        log.warn('backup:restore 文件夹名未通过路径守卫')
        return guarded
      }

      return scheduleRelaunch(await restoreDatabase(join(guarded.path, SNAPSHOT_FILE_NAME)))
    }
  )

  ipcMain.handle('backup:restoreFile', async (event): Promise<BackupRestoreResult> => {
    const win = senderWindow(event)
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    }
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)

    if (picked.canceled || picked.filePaths.length === 0) {
      log.debug('backup:restoreFile 用户取消')
      return { ok: false, code: 'canceled' }
    }

    return scheduleRelaunch(await restoreDatabase(picked.filePaths[0]))
  })

  ipcMain.handle('backup:export', async (event): Promise<BackupExportResult> => {
    if (isRestoreRunning()) {
      log.warn('backup:export 被拒绝：恢复进行中')
      return { ok: false, code: 'backup_in_progress' }
    }
    if (!tryStartBackupJob('export')) {
      log.warn('backup:export 重复调用（已有任务进行中）')
      return { ok: false, code: 'backup_in_progress' }
    }

    try {
      const win = senderWindow(event)
      const options: SaveDialogOptions = {
        defaultPath: join(app.getPath('documents'), buildBackupFileName()),
        filters: [{ name: 'SQLite Database', extensions: ['db'] }]
      }
      const saved = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)

      if (saved.canceled || !saved.filePath) {
        log.debug('backup:export 用户取消')
        return { ok: false, code: 'canceled' }
      }

      if (resolve(saved.filePath) === resolve(getDatabasePath())) {
        log.warn('backup:export 拒绝覆盖正在使用的数据库文件')
        return { ok: false, code: 'export_failed' }
      }

      await getDb().backup(saved.filePath)
      log.info('整库导出完成', { filePath: safePath(saved.filePath) })
      return { ok: true, path: saved.filePath }
    } catch (error) {
      log.error('整库导出失败', { error: safeError(error) })
      return { ok: false, code: 'export_failed' }
    } finally {
      finishBackupJob()
    }
  })

  ipcMain.handle('backup:openFolder', async (): Promise<BackupOkResult> => {
    try {
      const message = await shell.openPath(getBackupDir())
      if (message) {
        log.warn('打开备份目录失败')
        return { ok: false, code: 'open_failed' }
      }
      return { ok: true }
    } catch (error) {
      log.error('打开备份目录异常', { error: safeError(error) })
      return { ok: false, code: 'open_failed' }
    }
  })

  ipcMain.handle('backup:rename', (_event, payload: unknown): BackupRenameResult => {
    const input = readRenamePayload(payload)
    if (input === null) {
      log.warn('backup:rename 入参非法')
      return { ok: false, code: 'invalid_name' }
    }

    const result = renameBackup(input.folder, input.name)
    if (result.ok) {
      log.info('backup:rename 完成', { folder: result.item.folder })
    } else {
      log.warn('backup:rename 失败', { code: result.code })
    }
    return result
  })

  ipcMain.handle('backup:delete', async (_event, payload: unknown): Promise<BackupOkResult> => {
    const folder = readBackupFolder(payload)
    if (folder === null) {
      log.warn('backup:delete 入参非法')
      return { ok: false, code: 'invalid_name' }
    }

    const guarded = resolveBackupFolder(folder)
    if (!guarded.ok) {
      log.warn('backup:delete 文件夹名未通过路径守卫')
      return guarded
    }

    try {
      const info = await stat(guarded.path)
      if (!info.isDirectory()) {
        log.warn('backup:delete 目标不是文件夹', { folder })
        return { ok: false, code: 'not_found' }
      }
      await rm(guarded.path, { recursive: true, force: true })
      log.info('备份文件夹已删除', { folder })
      return { ok: true }
    } catch (error) {
      const code =
        (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not_found' : 'delete_failed'
      log.warn('删除备份文件夹失败', { folder, code, error: safeError(error) })
      return { ok: false, code }
    }
  })
}
