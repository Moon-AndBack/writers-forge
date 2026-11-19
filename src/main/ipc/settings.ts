import { ipcMain, type IpcMainInvokeEvent } from 'electron'
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
 * 放行项：`onedrive:account`（展示用明文邮箱）——渲染层需要读取，不得纳入。
 */
const SENSITIVE_KEY_PREFIXES = ['ai:', 'onedrive:credentials:'] as const

/** 键是否属于敏感域：四条 settings 通道共用同一判定，避免规则分叉。 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * 渲染层可写的**精确键**白名单（`settings:set` / `settings:delete` 共用）。
 *
 * 依据：全仓 `window.api.settings.set` 调用点（新增写路径必须同步在此登记）。
 * - 纯偏好 / 界面状态：`locale` / `autoSave` / `defaultView` / `theme` / `paperLines` /
 *   `penName` / `windowMaterial` / `typography` / `rightPaneHidden` / `activityBarPinned` /
 *   `workspaceWidths` / `trashListWidth` / `aiAssistantEnabled` / `cloudBackupProvider` /
 *   `onboardingCompleted`；
 * - 无书上下文（预览 / `bookId` 为空）时渲染层回退的裸键，见下方前缀白名单。
 *
 * 主进程自有键（`windowSize`、`ai:*`、`onedrive:*`、迁移 / 种子守卫等）一律不在此列。
 */
const WRITABLE_KEYS: ReadonlySet<string> = new Set([
  'locale',
  'autoSave',
  'defaultView',
  'theme',
  'paperLines',
  'penName',
  'windowMaterial',
  'typography',
  'rightPaneHidden',
  'activityBarPinned',
  'workspaceWidths',
  'trashListWidth',
  'aiAssistantEnabled',
  'cloudBackupProvider',
  'onboardingCompleted',
  'chapter:last',
  'timeline:list',
  'timeline:active',
  'timeline:origin'
])

/** 渲染层可写的动态前缀（按书隔离；对应裸键已在上方精确白名单）。 */
const WRITABLE_KEY_PREFIXES = [
  'chapter:last:',
  'timeline:list:',
  'timeline:active:',
  // 老键仅 migration 兼容；保留写权限避免旧渲染层（版本回退）落库失败。
  'timeline:origin:'
] as const

/**
 * 内部键模式：一次性迁移守卫 / 种子标记，只由主进程读写。
 *
 * 即使未来误把某个内部键加进可写白名单，也必须在这里拦住：
 * - `chapterData:vN:migrated`：删除会在下次启动重灌教学书，物理清空用户创作；
 * - `categories:seed:*`：删除会让官方分类重复插入（该表无唯一约束）；
 * - `*:seeded:*`：演示实体 / 伏笔 / 灵感被清空后重建；
 * - `*:migrated*`：老数据迁移被重复执行。
 */
const INTERNAL_KEY_PATTERNS: readonly RegExp[] = [
  /^chapterData:v\d+:migrated$/,
  /(?:^|:)seeded:/,
  /^categories:seed:/,
  /(?:^|:)migrated(?::|$)/,
  /^(?:books|cleanWords|dossier|foreshadows|i18n|inspirations|plot|world|worldCustom|worldEntities|worldItem|worldRefs|worldSubtypes|worldTexts):/,
  /^aiChat:/,
  /^onedrive:clientIdCleanup:/
]

/** 是否为内部键（迁移守卫 / 种子标记）。 */
function isInternalKey(key: string): boolean {
  return INTERNAL_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

/** 渲染层是否可写 / 可删该键：白名单命中且不属于内部键。 */
function isWritableKey(key: string): boolean {
  if (isInternalKey(key)) return false
  return WRITABLE_KEYS.has(key) || WRITABLE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/**
 * 单个 settings 值的长度上限（字符数，按 `string.length` 计）。
 *
 * 现网最大的合法值是 `timeline:list:<bookId>`（JSON 数组，内含每条时间线的
 * `descriptionJson`）。其它富文本入口的整条 JSON 上限为 20 万字符
 *（`RICH_TEXT_JSON_MAX_CHARS`，`src/shared/wordCount.ts`），2 MiB 是该上限的 10 倍，
 * 足以覆盖多条时间线；其余偏好键均 < 1 KB。超限视为异常写入，防止任意大字符串撑大表。
 */
const MAX_SETTING_VALUE_CHARS = 2 * 1024 * 1024

/** 调用来源（渲染层 URL），仅用于拒绝日志定位；框架已销毁时为 null。 */
function senderSource(event: IpcMainInvokeEvent): string | null {
  return event.senderFrame?.url ?? null
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

  ipcMain.handle('settings:set', (event, key: unknown, value: unknown) => {
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
    // 白名单之外的键一律拒绝：迁移守卫 / 种子标记一旦被删或改写，会触发重灌 / 重复插入。
    if (!isWritableKey(key)) {
      log.warn('settings:set 拒绝写入不可写键', {
        key,
        internal: isInternalKey(key),
        source: senderSource(event)
      })
      return false
    }
    if (value.length > MAX_SETTING_VALUE_CHARS) {
      log.warn('settings:set 拒绝写入超长值', {
        key,
        valueLength: value.length,
        limit: MAX_SETTING_VALUE_CHARS,
        source: senderSource(event)
      })
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

  ipcMain.handle('settings:delete', (event, key: unknown) => {
    if (typeof key !== 'string') return false
    // 敏感键的清理由主进程授权流程负责，禁止渲染层删除（避免绕过状态机静默登出）。
    if (isSensitiveKey(key)) {
      log.warn('settings:delete 拒绝删除敏感键', { key })
      return false
    }
    // 内部键（迁移守卫 / 种子标记）与主进程自有键只能由主进程删除。
    if (!isWritableKey(key)) {
      log.warn('settings:delete 拒绝删除不可写键', {
        key,
        internal: isInternalKey(key),
        source: senderSource(event)
      })
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
