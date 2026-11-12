import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { IpcMainInvokeEvent, OpenDialogOptions, SaveDialogOptions } from 'electron'
import { rm } from 'node:fs/promises'
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
  resolveBackupFilePath,
  restoreDatabase,
  tryStartBackupJob
} from '../backup'
import { getDatabasePath, getDb } from '../database'
import type {
  BackupCreateResult,
  BackupExportResult,
  BackupListResult,
  BackupOkResult,
  BackupRestoreResult
} from '../backup'

/**
 * 本地备份 / 恢复 IPC（通道前缀 `backup:`）。
 *
 * 通道：
 * - backup:list        ()            → { ok, items }（mtime 倒序）
 * - backup:create      ()            → { ok, item } / { ok:false, code }
 * - backup:restore     ({ name })    → { ok, safeCopyPath } / { ok:false, code }
 * - backup:restoreFile ()            → 主进程弹打开对话框后走同一恢复流程
 * - backup:export      ()            → 主进程弹保存对话框，导出整库 .db
 * - backup:openFolder  ()            → 打开备份目录
 * - backup:delete      ({ name })    → 删除备份目录内的指定文件
 *
 * 恢复成功后**先返回结果**，再用 300ms 延时 `app.relaunch()` + `app.exit(0)`，
 * 保证 IPC 响应先回到渲染层。可预期错误一律返回 `{ ok:false, code }`，
 * 只有非域内的意外异常才记日志后重抛。
 */

const log = logger.scope('backup:ipc')

/** 恢复成功到重启之间的延时（ms）：确保 IPC 响应先送达渲染层。 */
const RELAUNCH_DELAY_MS = 300

/** 从 `{ name }` 载荷读取备份文件名；非法返回 null。 */
function readBackupName(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { name } = payload as Record<string, unknown>
  return typeof name === 'string' ? name : null
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
        log.info('backup:create 完成', { filePath: safePath(result.item.path) })
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
      const name = readBackupName(payload)
      if (name === null) {
        log.warn('backup:restore 入参非法')
        return { ok: false, code: 'invalid_name' }
      }

      const guarded = resolveBackupFilePath(name)
      if (!guarded.ok) {
        log.warn('backup:restore 文件名未通过路径守卫')
        return guarded
      }

      return scheduleRelaunch(await restoreDatabase(guarded.path))
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
        defaultPath: join(app.getPath('documents'), buildBackupFileName('manual')),
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

  ipcMain.handle('backup:delete', async (_event, payload: unknown): Promise<BackupOkResult> => {
    const name = readBackupName(payload)
    if (name === null) {
      log.warn('backup:delete 入参非法')
      return { ok: false, code: 'invalid_name' }
    }

    const guarded = resolveBackupFilePath(name)
    if (!guarded.ok) {
      log.warn('backup:delete 文件名未通过路径守卫')
      return guarded
    }

    try {
      await rm(guarded.path)
      log.info('备份文件已删除', { filePath: safePath(guarded.path) })
      return { ok: true }
    } catch (error) {
      const code =
        (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not_found' : 'delete_failed'
      log.warn('删除备份文件失败', { code, error: safeError(error) })
      return { ok: false, code }
    }
  })
}
