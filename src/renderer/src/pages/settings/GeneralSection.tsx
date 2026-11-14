import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Select, Switch } from '../../components/ui'
import SectionCard from './SectionCard'
import SettingRow from './SettingRow'
import { settingRowDescriptionId } from './settingRowIds'
import { useLocale } from '../../i18n/context'
import { useSettingsValue } from './useSettingsValue'
import { DEFAULT_VIEW_OPTIONS, resolveDefaultView, type DefaultView } from './defaultView'
import {
  PEN_NAME_MAX_LENGTH,
  PEN_NAME_SETTING_KEY,
  decodePenName,
  validatePenName,
  type PenNameError
} from './penName'
import {
  AUTO_SAVE_DEFAULT,
  AUTO_SAVE_SETTING_KEY,
  decodeAutoSave
} from '../writer/useAutoSaveEnabled'

/** 界面语言档位（值写入 settings 键 `locale`；label 走 i18n，语言自称保留原文）。 */
const LOCALE_OPTIONS = [
  { value: 'zh-CN', labelKey: 'locale.zhCN' },
  { value: 'en', labelKey: 'locale.en' }
] as const

/** 默认打开视图档位的展示文案键（取值 / 校验见 `defaultView.ts`）。 */
type DefaultViewLabelKey = 'defaultView.bookshelf' | 'defaultView.chapter' | 'defaultView.outline'
const DEFAULT_VIEW_LABEL_KEYS: Record<DefaultView, DefaultViewLabelKey> = {
  bookshelf: 'defaultView.bookshelf',
  chapter: 'defaultView.chapter',
  outline: 'defaultView.outline'
}

/**
 * 笔名行：本地草稿 + 失焦 / 回车提交，避免每击键写库与广播。
 *
 * 外部写入（如引导页 / 其它组件）经 `useSettingsValue` 同键广播回来时，若本输入框
 * 未持有焦点则同步草稿；输入中不同步，避免覆盖用户正在编辑的内容。校验失败不写库，
 * 行内说明位切换为错误文案（danger），输入框同步 `invalid` 描边。
 */
function PenNameRow() {
  const { t } = useTranslation('settings')
  const { value: savedPenName, setValue: setPenName } = useSettingsValue(
    PEN_NAME_SETTING_KEY,
    '',
    decodePenName
  )
  const [draft, setDraft] = useState(savedPenName)
  // 提交过一次失败后才展示错误；之后随输入实时校准，改到合法即消失。
  const [showError, setShowError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const controlId = useId()

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraft(savedPenName)
      setShowError(false)
    }
  }, [savedPenName])

  const commit = useCallback((): void => {
    const nextError: PenNameError | null = validatePenName(draft)
    if (nextError !== null) {
      setShowError(true)
      return
    }
    setShowError(false)
    const trimmed = draft.trim()
    // 规范化显示（去两端空白）；与已保存值相同则不重复写库 / 广播。
    setDraft(trimmed)
    if (trimmed !== savedPenName) setPenName(trimmed)
  }, [draft, savedPenName, setPenName])

  const error: PenNameError | null = showError ? validatePenName(draft) : null
  const errorText =
    error === 'tooLong'
      ? t('penName.tooLong', { max: PEN_NAME_MAX_LENGTH })
      : error === 'blank'
        ? t('penName.blank')
        : null

  return (
    <SettingRow
      controlId={controlId}
      label={t('penName.label')}
      description={
        errorText !== null ? <span role="alert">{errorText}</span> : t('penName.description')
      }
      className={errorText !== null ? 'settings-row--error' : undefined}
    >
      <Input
        ref={inputRef}
        id={controlId}
        className="settings-control settings-control--wide"
        value={draft}
        autoComplete="off"
        placeholder={t('penName.placeholder')}
        invalid={error !== null}
        aria-describedby={settingRowDescriptionId(controlId)}
        onChange={(event) => {
          // 单行输入不接受换行：粘贴的多行文本压成单行空格。
          setDraft(event.target.value.replace(/[\r\n]+/g, ' '))
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </SettingRow>
  )
}

/**
 * 通用设置 · 基础偏好组。
 *
 * 落地策略（本批次）：
 * - 笔名：真源为 settings 键 `penName`，写库前 trim、空串表示清空（书籍卡回退
 *   「未署名」）。仅失焦 / 回车提交，外部同键广播在未聚焦时回填草稿。
 * - 界面语言：真源为全局 `LocaleProvider`（写 `locale` 键，`zh-CN` / `en`）。切换即经
 *   Provider 同步 i18next + `<html lang>` + 持久化；本组件仅消费，不再直读该键。
 * - 自动保存：写 `autoSave` 键（布尔），由写作域 `useAutoSaveEnabled` 消费——
 *   开启时章节 / 大纲正文停止输入 800ms 自动落库；关闭时仅手动保存，切章 / 切模块 /
 *   关窗仍会统一 flush（安全网）。剧情 / 设定档案 / 伏笔 / 灵感本身为手动保存，不受影响。
 * - 默认打开视图：写 `defaultView` 键（`bookshelf` / `chapter` / `outline`）。启动时由
 *   `App` 读取并决定首屏（书架，或最近编辑的书 + 章节 / 大纲视图）；仅在启动时生效一次，
 *   不干扰后续导航。历史值 `recent` 未实现，已移除并回落书架。
 */
export default function GeneralSection() {
  const { t } = useTranslation('settings')
  const { locale, setLocale } = useLocale()
  const autoSave = useSettingsValue(AUTO_SAVE_SETTING_KEY, AUTO_SAVE_DEFAULT, decodeAutoSave)
  const defaultView = useSettingsValue('defaultView', 'bookshelf', resolveDefaultView)
  const localeId = useId()
  const autoSaveId = useId()
  const defaultViewId = useId()

  return (
    <SectionCard>
      <PenNameRow />

      <SettingRow controlId={localeId} label={t('locale.label')}>
        <Select
          id={localeId}
          className="settings-control settings-control--select"
          value={locale}
          options={LOCALE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          ariaLabel={t('locale.label')}
          onChange={(value) => setLocale(value === 'en' ? 'en' : 'zh-CN')}
        />
      </SettingRow>

      <SettingRow
        controlId={autoSaveId}
        label={t('autoSave.label')}
        description={t('autoSave.description')}
      >
        <Switch
          id={autoSaveId}
          aria-describedby={settingRowDescriptionId(autoSaveId)}
          checked={autoSave.value}
          aria-label={t('autoSave.label')}
          onChange={(event) => autoSave.setValue(event.target.checked)}
        />
      </SettingRow>

      <SettingRow
        controlId={defaultViewId}
        label={t('defaultView.label')}
        description={t('defaultView.description')}
      >
        <Select
          id={defaultViewId}
          ariaDescribedBy={settingRowDescriptionId(defaultViewId)}
          className="settings-control settings-control--select"
          value={defaultView.value}
          options={DEFAULT_VIEW_OPTIONS.map((option) => ({
            value: option,
            label: t(DEFAULT_VIEW_LABEL_KEYS[option])
          }))}
          ariaLabel={t('defaultView.label')}
          onChange={(value) => defaultView.setValue(resolveDefaultView(value))}
        />
      </SettingRow>
    </SectionCard>
  )
}
