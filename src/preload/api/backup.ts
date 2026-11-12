import { ipcRenderer } from 'electron'
import type { BackupApi } from '../types/backup'

/**
 * preload · 本地备份 / 恢复通道（`backup:*`）。
 *
 * 签名真源为 `types/backup.d.ts` 的 `BackupApi`，此处以 `satisfies` 结构校验，
 * 避免逐方法重复类型标注。本域无推送事件，全部为请求 / 响应。
 */
export const backupApi = {
  list: () => ipcRenderer.invoke('backup:list'),
  create: () => ipcRenderer.invoke('backup:create'),
  restore: (folder) => ipcRenderer.invoke('backup:restore', { folder }),
  restoreFile: () => ipcRenderer.invoke('backup:restoreFile'),
  export: () => ipcRenderer.invoke('backup:export'),
  openFolder: () => ipcRenderer.invoke('backup:openFolder'),
  rename: (folder, name) => ipcRenderer.invoke('backup:rename', { folder, name }),
  delete: (folder) => ipcRenderer.invoke('backup:delete', { folder })
} satisfies BackupApi
