import { ipcRenderer } from 'electron'
import type { Api } from '../types/window'

/**
 * preload · 统一设定库通道（`worldEntity:*`）。
 *
 * 自 `index.ts` 拆出（§3 单文件 ≤500 行）：主表 CRUD、别名 / 长文本 / 标签、通用引用，
 * 以及境界体系（体系信息）读写。签名真源为 `types/window.d.ts` 的
 * `Api['worldEntity']`，此处以 `satisfies` 结构校验，避免逐方法重复类型标注。
 */
export const worldEntityApi = {
  list: (bookId, type, subtypeId) =>
    ipcRenderer.invoke('worldEntity:list', bookId, type, subtypeId),
  get: (id) => ipcRenderer.invoke('worldEntity:get', id),
  create: (input) => ipcRenderer.invoke('worldEntity:create', input),
  update: (id, patch) => ipcRenderer.invoke('worldEntity:update', id, patch),
  delete: (id) => ipcRenderer.invoke('worldEntity:delete', id),
  listAliases: (id) => ipcRenderer.invoke('worldEntity:listAliases', id),
  setAliases: (id, aliases) => ipcRenderer.invoke('worldEntity:setAliases', id, aliases),
  getText: (id) => ipcRenderer.invoke('worldEntity:getText', id),
  saveText: (id, body, bodyJson) => ipcRenderer.invoke('worldEntity:saveText', id, body, bodyJson),
  listTags: (bookId) => ipcRenderer.invoke('worldEntity:listTags', bookId),
  setTags: (id, names) => ipcRenderer.invoke('worldEntity:setTags', id, names),
  listRefs: (id, semanticCode) => ipcRenderer.invoke('worldEntity:listRefs', id, semanticCode),
  listIncomingRefs: (id, semanticCode) =>
    ipcRenderer.invoke('worldEntity:listIncomingRefs', id, semanticCode),
  listSemanticCodes: () => ipcRenderer.invoke('worldEntity:listSemanticCodes'),
  addRef: (input) => ipcRenderer.invoke('worldEntity:addRef', input),
  updateRef: (id, patch) => ipcRenderer.invoke('worldEntity:updateRef', id, patch),
  removeRef: (id) => ipcRenderer.invoke('worldEntity:removeRef', id),
  listPowerSystems: (bookId) => ipcRenderer.invoke('worldEntity:listPowerSystems', bookId),
  updatePowerSystem: (entityId, patch) =>
    ipcRenderer.invoke('worldEntity:updatePowerSystem', entityId, patch)
} satisfies Api['worldEntity']
