import { ipcMain } from 'electron'
import { logger } from '../logger'
import { deleteSetting, getAllSettings, getSetting, setSetting } from '../database/settings'

/** 设置域日志 scope。 */
const log = logger.scope('settings')

/**
 * 不向渲染层开放（不可读 / 不可写 / 不可删 / 不可枚举）的键前缀。
 *
 * - `ai:`                     加密后的 API Key（`ai:deepseek:apiKey`）及服务商 / 模型配置；
 * - `onedrive:credentials:`   safeStorage 加密凭据（`onedrive:credentials:v1`）。
 *
 * **新增敏感域时在此登记**（前缀或完整键均可，`startsWith` 对完整键等价）。
 *
 * 放行项：`onedrive:clientId`（Azure 公共客户端 ID，非密钥，设置页可编辑）、
 * `onedrive:account`（展示用明文邮箱）——渲染层需要读取，不得纳入。
 */
const SENSITIVE_KEY_PREFIXES = ['ai:', 'onedrive:credentials:'] as const

/** 键是否属于敏感域：四条 settings 通道共用同一判定，避免规则分叉。 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** 通用键值设置域 IPC：通道前缀 `settings:`。 */
export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', (_event, key: unknown) => {
    if (typeof key !== 'string') return null
    // 敏感键返回 null（与「未设置」不可区分），不抛错以免破坏 `Promise<string | null>` 契约。
    if (isSensitiveKey(key)) {
      log.warn('settings:get 拒绝读取敏感键', { key })
      return null
    }
    return getSetting(key)
  })

  ipcMain.handle('settings:set', (_event, key: unknown, value: unknown) => {
    if (typeof key !== 'string' || typeof value !== 'string') {
      // 非法入参可能携带任意内容：仅记录键名与值的类型 / 长度，绝不记录完整 value。
      log.warn('settings:set 入参非法', {
        key: typeof key === 'string' ? key : null,
        keyType: typeof key,
        valueType: typeof value,
        valueLength: typeof value === 'string' ? value.length : null
      })
      return false
    }
    // 敏感键只能由主进程自身写入，禁止渲染层覆盖（如篡改 OneDrive 密文）。
    if (isSensitiveKey(key)) {
      log.warn('settings:set 拒绝写入敏感键', { key })
      return false
    }
    try {
      setSetting(key, value)
      // 值可能含敏感信息，仅记录键名与长度。
      log.debug('settings:set 成功', { key, valueLength: value.length })
      return true
    } catch (error) {
      log.error('settings:set 失败', { key, error })
      throw error
    }
  })

  // 全量回传前剔除敏感键（`ai:*` 密钥 / OneDrive 凭据）。
  // 渲染层启动阶段（main.tsx）用它一次批量取主题 / 材质 / 活动栏固定态，替代多次 `settings:get`。
  ipcMain.handle('settings:all', () => {
    const all = getAllSettings()
    const visible: Record<string, string> = {}
    let hidden = 0
    for (const [key, value] of Object.entries(all)) {
      if (isSensitiveKey(key)) {
        hidden += 1
        continue
      }
      visible[key] = value
    }
    if (hidden > 0) log.debug('settings:all 已剔除敏感键', { hidden })
    return visible
  })

  ipcMain.handle('settings:delete', (_event, key: unknown) => {
    if (typeof key !== 'string') return false
    // 敏感键的清理由主进程授权流程负责，禁止渲染层删除（避免绕过状态机静默登出）。
    if (isSensitiveKey(key)) {
      log.warn('settings:delete 拒绝删除敏感键', { key })
      return false
    }
    try {
      const ok = deleteSetting(key)
      log.debug('settings:delete 完成', { key, ok })
      return ok
    } catch (error) {
      log.error('settings:delete 失败', { key, error })
      throw error
    }
  })
}
