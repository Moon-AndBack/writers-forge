import { ipcRenderer } from 'electron'
import type { Api } from '../types/window'

/**
 * preload · 子类分类表通道（`worldSubtype:*`）。
 *
 * 签名真源为 `types/window.d.ts` 的 `Api['worldSubtype']`，此处以 `satisfies`
 * 结构校验，避免逐方法重复类型标注。
 */
export const worldSubtypeApi = {
  list: (bookId, entityType) => ipcRenderer.invoke('worldSubtype:list', bookId, entityType),
  create: (input) => ipcRenderer.invoke('worldSubtype:create', input),
  update: (id, patch) => ipcRenderer.invoke('worldSubtype:update', id, patch),
  delete: (id) => ipcRenderer.invoke('worldSubtype:delete', id),
  ensurePresets: (bookId) => ipcRenderer.invoke('worldSubtype:ensurePresets', bookId)
} satisfies Api['worldSubtype']
