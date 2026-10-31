import { ipcMain } from 'electron'
import { listChipColors } from '../database/chipColors'

/**
 * 胶囊配色表 IPC：通道前缀 `chipColors:`。
 *
 * - chipColors:list → ChipColorRow[]（28 行 = 23 条预设子类 + 5 条模块兜底）
 *
 * 配色为**全局**配置（不按书隔离），故本通道无入参、也无需入参校验；
 * 本步只读，写通道后续批次再补。
 */
export function registerChipColorsIpc(): void {
  ipcMain.handle('chipColors:list', () => listChipColors())
}
