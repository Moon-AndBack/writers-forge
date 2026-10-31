import { ipcRenderer } from 'electron'
import type { Api } from '../types/window'

/**
 * preload · 违禁词库通道（`cleanWords:*`）。
 *
 * 签名真源为 `types/window.d.ts` 的 `Api['cleanWords']`，此处以 `satisfies`
 * 结构校验，避免逐方法重复类型标注。
 *
 * 🔴 `import` 的来源在本层写死为 `'user'`，不暴露给调用方：
 * 内置词库由主进程播种管理，渲染层永远无法把词写进 `builtin`。
 */
export const cleanWordsApi = {
  list: (filter) => ipcRenderer.invoke('cleanWords:list', filter),
  count: () => ipcRenderer.invoke('cleanWords:count'),
  active: () => ipcRenderer.invoke('cleanWords:active'),
  import: (words) => ipcRenderer.invoke('cleanWords:import', { words, source: 'user' }),
  toggle: (id, enabled) => ipcRenderer.invoke('cleanWords:toggle', { id, enabled }),
  delete: (id) => ipcRenderer.invoke('cleanWords:delete', { id })
} satisfies Api['cleanWords']
