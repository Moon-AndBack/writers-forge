import { ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  OneDriveApi,
  OneDriveBackupProgress,
  OneDriveRestoreProgress
} from '../types/onedrive'

/**
 * preload · OneDrive 备份通道（`onedrive:*`）。
 *
 * 签名真源为 `types/onedrive.d.ts` 的 `OneDriveApi`，此处以 `satisfies` 结构校验，
 * 避免逐方法重复类型标注。
 *
 * ⚠️ 进度事件约定（与 `api/ai.ts` 同范式）：`ipcRenderer.on` 只在**模块顶层注册一次**，
 * 用 `Set` 向多个订阅者分发——若在 `onProgress` 内注册监听，同一事件会被重复触发 N 次，
 * 且退订只能靠 `removeListener` 逐个精确匹配，既易漏也不可回收。
 */

/** 订阅者集合（模块单例；`onProgress` 只做 add / delete）。 */
const progressListeners = new Set<(progress: OneDriveBackupProgress) => void>()

/** 云端恢复进度订阅者集合。 */
const restoreProgressListeners = new Set<(progress: OneDriveRestoreProgress) => void>()

/** 合法的进度阶段全集（与 `main/onedrive` 的 `OneDriveBackupPhase` 同步）。 */
const PROGRESS_PHASES: readonly string[] = ['snapshot', 'upload', 'download', 'restore', 'done']

/** 合法的恢复阶段全集（`OneDriveRestoreProgress['phase']` 子集）。 */
const RESTORE_PHASES: readonly string[] = ['download', 'restore', 'done']

/** 事件分发：单个订阅者抛错不得影响其它订阅者。 */
function emitProgress(progress: OneDriveBackupProgress): void {
  // 复制一份再遍历：允许回调内部退订 / 新增订阅而不破坏本次迭代。
  for (const listener of [...progressListeners]) {
    try {
      listener(progress)
    } catch {
      // preload 无日志落盘通道；此处静默，避免一个订阅者拖垮整条推送链。
    }
  }
}

/** 恢复进度事件分发（同上）。 */
function emitRestoreProgress(progress: OneDriveRestoreProgress): void {
  for (const listener of [...restoreProgressListeners]) {
    try {
      listener(progress)
    } catch {
      // 静默：单个订阅者异常不得阻断其它订阅者。
    }
  }
}

/** 读取进度载荷；字段缺失 / 类型不符视为非法载荷，直接丢弃。 */
function readProgress(value: unknown): OneDriveBackupProgress | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const { phase, bytesSent, totalBytes, percent } = record
  if (typeof phase !== 'string' || !PROGRESS_PHASES.includes(phase)) return null
  if (
    typeof bytesSent !== 'number' ||
    typeof totalBytes !== 'number' ||
    typeof percent !== 'number' ||
    !Number.isFinite(bytesSent) ||
    !Number.isFinite(totalBytes) ||
    !Number.isFinite(percent)
  ) {
    return null
  }
  return { phase: phase as OneDriveBackupProgress['phase'], bytesSent, totalBytes, percent }
}

ipcRenderer.on('onedrive:progress', (_event: IpcRendererEvent, payload: unknown) => {
  const progress = readProgress(payload)
  if (progress) emitProgress(progress)
})

/** 读取恢复进度载荷；非法载荷直接丢弃。 */
function readRestoreProgress(value: unknown): OneDriveRestoreProgress | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const { phase, bytesReceived, totalBytes, percent } = record
  if (typeof phase !== 'string' || !RESTORE_PHASES.includes(phase)) return null
  if (
    typeof bytesReceived !== 'number' ||
    typeof totalBytes !== 'number' ||
    typeof percent !== 'number' ||
    !Number.isFinite(bytesReceived) ||
    !Number.isFinite(totalBytes) ||
    !Number.isFinite(percent)
  ) {
    return null
  }
  return {
    phase: phase as OneDriveRestoreProgress['phase'],
    bytesReceived,
    totalBytes,
    percent
  }
}

ipcRenderer.on('onedrive:restoreProgress', (_event: IpcRendererEvent, payload: unknown) => {
  const progress = readRestoreProgress(payload)
  if (progress) emitRestoreProgress(progress)
})

export const onedriveApi = {
  status: () => ipcRenderer.invoke('onedrive:status'),
  signIn: () => ipcRenderer.invoke('onedrive:signIn'),
  cancelSignIn: () => ipcRenderer.invoke('onedrive:cancelSignIn'),
  signOut: () => ipcRenderer.invoke('onedrive:signOut'),
  backup: () => ipcRenderer.invoke('onedrive:backup'),
  cancelBackup: () => ipcRenderer.invoke('onedrive:cancelBackup'),
  listBackups: () => ipcRenderer.invoke('onedrive:listBackups'),
  restoreBackup: (itemId) => ipcRenderer.invoke('onedrive:restoreBackup', { itemId }),
  cancelRestore: () => ipcRenderer.invoke('onedrive:cancelRestore'),
  onProgress: (callback) => {
    progressListeners.add(callback)
    return () => {
      progressListeners.delete(callback)
    }
  },
  onRestoreProgress: (callback) => {
    restoreProgressListeners.add(callback)
    return () => {
      restoreProgressListeners.delete(callback)
    }
  }
} satisfies OneDriveApi
