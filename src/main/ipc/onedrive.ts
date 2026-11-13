import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import type { BackupRestoreResult } from '../backup'
import { scheduleRelaunch } from '../backup/relaunch'
import { logger } from '../logger'
import {
  cancelSignIn,
  deleteRemoteBackup,
  getOneDriveAuthStatus,
  isBackupRunning,
  isOneDriveError,
  isSignInInProgress,
  listRemoteBackups,
  restoreRemoteBackup,
  runBackup,
  signIn,
  signOut
} from '../onedrive'
import { safeError } from '../onedrive/logSafe'
import type {
  OneDriveAuthStatus,
  OneDriveBackupProgress,
  OneDriveBackupResult,
  OneDriveError,
  OneDriveErrorCode,
  OneDriveRestoreProgress,
  RemoteBackupItem
} from '../onedrive'

/**
 * OneDrive 备份域 IPC（通道前缀 `onedrive:`）。
 *
 * 通道：
 * - onedrive:status        ()                 → OneDriveStatus（一次拿全，永不失败）
 * - onedrive:signIn        ()                 → OneDriveResult<OneDriveAuthStatus>
 * - onedrive:cancelSignIn  ()                 → boolean（是否有进行中的授权被取消）
 * - onedrive:signOut       ()                 → OneDriveStatus
 * - onedrive:backup        ()                 → OneDriveResult<OneDriveBackupResult>
 * - onedrive:cancelBackup  ()                 → boolean（是否中断了进行中的备份）
 * - onedrive:listBackups   ()                 → OneDriveResult<RemoteBackupItem[]>
 * - onedrive:deleteBackup  ({ itemId })       → OneDriveDeleteResult（成功无载荷）
 * - onedrive:restoreBackup ({ itemId })       → OneDriveResult<BackupRestoreResult>
 * - onedrive:cancelRestore ()                 → boolean（是否中断了进行中的恢复）
 * 推送（主进程 → 渲染层）：
 * - onedrive:progress      OneDriveBackupProgress
 * - onedrive:restoreProgress OneDriveRestoreProgress
 *
 * ⚠️ 错误跨进程契约：`OneDriveError` 经 IPC 序列化后只剩 `name` / `message`，
 * `code` / `status` 会丢失，渲染层便无法走 i18n 映射。因此本文件对**可预期的域内错误**
 * 一律**不抛异常**，改为返回结构化对象 `{ ok: false, code, status? }`（code 原样透传）；
 * 只有**非 OneDriveError 的意外异常**（编程错误 / 数据库故障）才 `log.error` 后重抛。
 * `message` 为英文技术描述，不得作为 UI 文案。
 *
 * 备份 / 授权均为长任务：`ipcMain.handle` 会挂到流程结束；取消走独立通道，
 * 授权由 `cancelSignIn()` 关闭回环 server，备份由模块级 `AbortController` 中断。
 */

const log = logger.scope('onedrive:ipc')

/** 授权状态聚合（`getOneDriveAuthStatus` + 运行态）。 */
export interface OneDriveStatus extends OneDriveAuthStatus {
  /** 是否有授权流程进行中（浏览器等待回调）。 */
  signingIn: boolean
  /** 是否有备份进行中。 */
  backupRunning: boolean
  /** 是否有云端恢复进行中（下载 / 校验 / 替换数据库）。 */
  restoreRunning: boolean
}

/** 结构化失败载荷；`code` 为渲染层 i18n 映射的唯一依据。 */
export interface OneDriveFailure {
  ok: false
  code: OneDriveErrorCode
  /** 上游 HTTP 状态（无则省略）。 */
  status?: number
}

/** 可预期错误的统一返回形状；意外异常仍然抛出。 */
export type OneDriveResult<T> = { ok: true; value: T } | OneDriveFailure

/** 无载荷操作（删除）的结果：成功只回 `{ ok: true }`。 */
export type OneDriveDeleteResult = { ok: true } | OneDriveFailure

/** 备份取消控制器（同一时刻至多一个；`runBackup` 自身亦有互斥）。 */
let activeBackupController: AbortController | null = null
/** 云端恢复取消控制器（同一时刻至多一个；下载阶段可取消）。 */
let activeRestoreController: AbortController | null = null

/** 汇总当前状态（供 status / signOut 复用）。 */
function currentStatus(): OneDriveStatus {
  return {
    ...getOneDriveAuthStatus(),
    signingIn: isSignInInProgress(),
    backupRunning: isBackupRunning(),
    restoreRunning: activeRestoreController !== null
  }
}

/** `OneDriveError` → 结构化失败（不携带 message）。 */
function toFailure(error: OneDriveError): OneDriveFailure {
  return error.status === undefined
    ? { ok: false, code: error.code }
    : { ok: false, code: error.code, status: error.status }
}

/** 单向下发进度；窗口已销毁时静默丢弃（避免 `send` 抛错）。 */
function sendProgress(sender: WebContents, progress: OneDriveBackupProgress): void {
  if (sender.isDestroyed()) return
  sender.send('onedrive:progress', progress)
}

/** 单向下发云端恢复进度；窗口已销毁时静默丢弃。 */
function sendRestoreProgress(sender: WebContents, progress: OneDriveRestoreProgress): void {
  if (sender.isDestroyed()) return
  sender.send('onedrive:restoreProgress', progress)
}

/** 从 `{ itemId }` 载荷读取远端条目 id（恢复 / 删除共用）；非法返回 null。 */
function readItemId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const { itemId } = payload as Record<string, unknown>
  return typeof itemId === 'string' && itemId.trim() !== '' ? itemId.trim() : null
}

/** 注册 OneDrive 备份域 IPC。 */
export function registerOneDriveIpc(): void {
  ipcMain.handle('onedrive:status', (): OneDriveStatus => currentStatus())

  ipcMain.handle('onedrive:signIn', async (): Promise<OneDriveResult<OneDriveAuthStatus>> => {
    try {
      // 取消由 cancelSignIn 通道触发（内部会以 auth_cancelled 拒绝本次 signIn）。
      const status = await signIn()
      log.info('onedrive:signIn 完成', { signedIn: status.signedIn })
      return { ok: true, value: status }
    } catch (error) {
      if (isOneDriveError(error)) {
        log.warn('onedrive:signIn 失败', safeError(error))
        return toFailure(error)
      }
      log.error('onedrive:signIn 意外异常', { error: safeError(error) })
      throw error
    }
  })

  ipcMain.handle('onedrive:cancelSignIn', (): boolean => {
    const wasRunning = isSignInInProgress()
    cancelSignIn()
    log.debug('onedrive:cancelSignIn', { wasRunning })
    return wasRunning
  })

  ipcMain.handle('onedrive:signOut', (): OneDriveStatus => {
    try {
      signOut()
      return currentStatus()
    } catch (error) {
      log.error('onedrive:signOut 失败', { error: safeError(error) })
      throw error
    }
  })

  ipcMain.handle(
    'onedrive:backup',
    async (event): Promise<OneDriveResult<OneDriveBackupResult>> => {
      if (
        isBackupRunning() ||
        activeBackupController !== null ||
        activeRestoreController !== null
      ) {
        log.warn('onedrive:backup 重复调用（已有任务进行中）')
        return { ok: false, code: 'backup_in_progress' }
      }

      const sender = event.sender
      const controller = new AbortController()
      activeBackupController = controller
      try {
        const result = await runBackup({
          signal: controller.signal,
          onProgress: (progress) => sendProgress(sender, progress)
        })
        log.info('onedrive:backup 完成', {
          fileName: result.fileName,
          sizeBytes: result.sizeBytes,
          durationMs: result.durationMs
        })
        return { ok: true, value: result }
      } catch (error) {
        if (isOneDriveError(error)) {
          log.warn('onedrive:backup 失败', safeError(error))
          return toFailure(error)
        }
        log.error('onedrive:backup 意外异常', { error: safeError(error) })
        throw error
      } finally {
        if (activeBackupController === controller) activeBackupController = null
      }
    }
  )

  ipcMain.handle('onedrive:cancelBackup', (): boolean => {
    const controller = activeBackupController
    if (!controller) return false
    controller.abort()
    log.info('onedrive:cancelBackup 已请求取消')
    return true
  })

  ipcMain.handle('onedrive:listBackups', async (): Promise<OneDriveResult<RemoteBackupItem[]>> => {
    try {
      const items = await listRemoteBackups()
      log.info('onedrive:listBackups 完成', { count: items.length })
      return { ok: true, value: items }
    } catch (error) {
      if (isOneDriveError(error)) {
        log.warn('onedrive:listBackups 失败', safeError(error))
        return toFailure(error)
      }
      log.error('onedrive:listBackups 意外异常', { error: safeError(error) })
      throw error
    }
  })

  ipcMain.handle(
    'onedrive:deleteBackup',
    async (_event, payload: unknown): Promise<OneDriveDeleteResult> => {
      const itemId = readItemId(payload)
      if (itemId === null) {
        log.warn('onedrive:deleteBackup 入参非法')
        return { ok: false, code: 'remote_not_found' }
      }
      if (
        isBackupRunning() ||
        activeBackupController !== null ||
        activeRestoreController !== null
      ) {
        log.warn('onedrive:deleteBackup 被拒绝：已有任务进行中')
        return { ok: false, code: 'backup_in_progress' }
      }

      try {
        await deleteRemoteBackup({ itemId })
        log.info('onedrive:deleteBackup 完成', { itemId })
        return { ok: true }
      } catch (error) {
        if (isOneDriveError(error)) {
          log.warn('onedrive:deleteBackup 失败', safeError(error))
          return toFailure(error)
        }
        log.error('onedrive:deleteBackup 意外异常', { error: safeError(error) })
        throw error
      }
    }
  )

  ipcMain.handle(
    'onedrive:restoreBackup',
    async (event, payload: unknown): Promise<OneDriveResult<BackupRestoreResult>> => {
      const itemId = readItemId(payload)
      if (itemId === null) {
        log.warn('onedrive:restoreBackup 入参非法')
        return { ok: false, code: 'remote_not_found' }
      }
      if (
        isBackupRunning() ||
        activeBackupController !== null ||
        activeRestoreController !== null
      ) {
        log.warn('onedrive:restoreBackup 被拒绝：已有任务进行中')
        return { ok: false, code: 'backup_in_progress' }
      }

      const sender = event.sender
      const controller = new AbortController()
      activeRestoreController = controller
      try {
        // 下载阶段不占用本地任务锁；`restoreRemoteBackup` 在调用
        // `restoreDatabase` 时才由其内部 `tryStartBackupJob('restore')` 占锁。
        const result = await restoreRemoteBackup({
          itemId,
          signal: controller.signal,
          onProgress: (progress) => sendRestoreProgress(sender, progress)
        })
        if (result.ok) {
          scheduleRelaunch()
        } else {
          log.warn('onedrive:restoreBackup 失败', { code: result.code })
        }
        return { ok: true, value: result }
      } catch (error) {
        if (isOneDriveError(error)) {
          log.warn('onedrive:restoreBackup 失败', safeError(error))
          return toFailure(error)
        }
        log.error('onedrive:restoreBackup 意外异常', { error: safeError(error) })
        throw error
      } finally {
        if (activeRestoreController === controller) activeRestoreController = null
      }
    }
  )

  ipcMain.handle('onedrive:cancelRestore', (): boolean => {
    const controller = activeRestoreController
    if (!controller) return false
    controller.abort()
    log.info('onedrive:cancelRestore 已请求取消')
    return true
  })
}
