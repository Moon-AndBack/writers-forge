import { ipcRenderer } from 'electron'
import type { Api } from '../types/window'

/**
 * preload · 胶囊配色表通道（`chipColors:*`）。
 *
 * 签名真源为 `types/window.d.ts` 的 `Api['chipColors']`，此处以 `satisfies`
 * 结构校验，避免逐方法重复类型标注。
 */
export const chipColorsApi = {
  list: () => ipcRenderer.invoke('chipColors:list')
} satisfies Api['chipColors']
