/**
 * 「重置为默认」：把设置弹窗里可重置的**界面偏好**恢复默认值。
 *
 * 白名单只允许 `locale` / `autoSave` / `defaultView` / `theme` / `paperLines` 五项。
 * **禁止**把下列 settings 键加入 `RESETTABLE_SETTINGS`（它们与偏好混在同一张表）：
 * - `*:vN` 迁移 / 播种守卫（如 `chapterData:vN:migrated`、`categories:seed:v1`）：
 *   删除会让教学书被重灌、官方分类重复插入（播种无 `ON CONFLICT`）；
 * - `worldEntities:seeded:*`：删除后演示实体会被清空并按当前文案重建；
 * - `timeline:list:<bookId>` / `penName`：属于用户内容，删除即丢失已写的时间线
 *   名称 / 起点 / 描述与笔名；
 * - `ai:*` / `onedrive:credentials:*`：凭据与登录态，重置偏好不应顺带退出登录
 *   （`settings:delete` 本身也拒绝这两类前缀）。
 *
 * 实现走各自 setter 写默认值，**不删除键**：`ThemeProvider` / `LocaleProvider`
 * 与其它消费方不监听 settings 表的删除，删键不会让界面回退；写值则经既有链路
 * （context 状态 + 同键广播 + 各自持久化）即时生效并落库。
 */
import { useCallback } from 'react'
import { resolveLocale } from '../../i18n/config'
import { useLocale } from '../../i18n/context'
import { useTheme } from '../../theme/useTheme'
import { DEFAULT_THEME } from '../../theme/themes'
import {
  PAPER_LINES_DEFAULT,
  PAPER_LINES_SETTING_KEY,
  decodePaperLines
} from '../../shell/paperLines'
import {
  AUTO_SAVE_DEFAULT,
  AUTO_SAVE_SETTING_KEY,
  decodeAutoSave
} from '../writer/useAutoSaveEnabled'
import { DEFAULT_DEFAULT_VIEW, DEFAULT_VIEW_SETTING_KEY, resolveDefaultView } from './defaultView'
import { useSettingsValue } from './useSettingsValue'

/**
 * 可重置项白名单与各自默认值（设置弹窗「重置为默认」的唯一真源）。
 *
 * `locale` 的默认值写作 `'system'` 哨兵：重置时按 `navigator.language` 经
 * `resolveLocale()` 解析成具体档位（与首启缺省语言的解析口径一致）。
 */
export const RESETTABLE_SETTINGS = {
  locale: 'system',
  autoSave: AUTO_SAVE_DEFAULT,
  defaultView: DEFAULT_DEFAULT_VIEW,
  theme: DEFAULT_THEME,
  paperLines: PAPER_LINES_DEFAULT
} as const

/**
 * 返回「恢复五项界面偏好默认值」的回调。
 *
 * 语言跟随系统（`resolveLocale(navigator.language)`），其余写各自默认值；
 * 默认打开视图仅在下次启动读取，其余四项即时生效。
 */
export function useResetSettings(): () => void {
  const { setLocale } = useLocale()
  const { setTheme } = useTheme()
  const { setValue: setAutoSave } = useSettingsValue(
    AUTO_SAVE_SETTING_KEY,
    AUTO_SAVE_DEFAULT,
    decodeAutoSave
  )
  const { setValue: setDefaultView } = useSettingsValue(
    DEFAULT_VIEW_SETTING_KEY,
    DEFAULT_DEFAULT_VIEW,
    resolveDefaultView
  )
  const { setValue: setPaperLines } = useSettingsValue(
    PAPER_LINES_SETTING_KEY,
    PAPER_LINES_DEFAULT,
    decodePaperLines
  )

  return useCallback(() => {
    setLocale(resolveLocale(navigator.language))
    setAutoSave(RESETTABLE_SETTINGS.autoSave)
    setDefaultView(RESETTABLE_SETTINGS.defaultView)
    setTheme(RESETTABLE_SETTINGS.theme)
    setPaperLines(RESETTABLE_SETTINGS.paperLines)
  }, [setLocale, setTheme, setAutoSave, setDefaultView, setPaperLines])
}

export default useResetSettings
