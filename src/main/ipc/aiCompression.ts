import { ipcMain } from 'electron'
import { getSetting, setSetting } from '../database/settings'
import { logger } from '../logger'

/**
 * 上下文自动压缩开关（通道 `ai:compression:get|set`）。
 *
 * 为什么不复用 `settings:*`：`ai:` 前缀的键在 `ipc/settings.ts` 中对渲染层
 * 全部屏蔽（该前缀含加密后的 API Key），因此该开关只能走 AI 域专用通道。
 * 存储仍是 `settings` 表 KV（键 `ai:compression:enabled`），不改表结构。
 */
const log = logger.scope('ai:compression')

/** settings 键：布尔（'true' / 'false'），缺省视为开启。 */
const COMPRESSION_KEY = 'ai:compression:enabled'

/** 读取开关：仅显式写入 'false' 才视为关闭（老库无该键 → 默认开启）。 */
function isCompressionEnabled(): boolean {
  return getSetting(COMPRESSION_KEY) !== 'false'
}

/** 注册上下文压缩开关 IPC。 */
export function registerAiCompressionIpc(): void {
  ipcMain.handle('ai:compression:get', () => isCompressionEnabled())

  ipcMain.handle('ai:compression:set', (_event, input: unknown): boolean => {
    if (typeof input !== 'boolean') {
      log.warn('ai:compression:set 入参非法')
      return false
    }
    try {
      setSetting(COMPRESSION_KEY, input ? 'true' : 'false')
      log.debug('ai:compression:set 完成', { enabled: input })
      return true
    } catch (error) {
      log.warn('ai:compression:set 失败', { error })
      return false
    }
  })
}
