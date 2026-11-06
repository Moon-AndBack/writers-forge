import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FormField, Input } from '../../../components/ui'
import {
  parseTimelineList,
  resolveActiveEntry,
  timelineActiveKey,
  timelineListKey
} from './timelineOrigin'

export interface TimelineOriginPanelProps {
  /** 书籍 id（路由参数）；按书读取 `timeline:list:<bookId>`。 */
  bookId?: string
  /** 当前选中时间线 id；切换时重新读取对应条目的描述。 */
  activeTimelineId?: string | null
  /** 写回当前选中时间线的起点描述（页面层 `updateDescription`）。 */
  onSaveDescription: (description: string) => Promise<boolean>
}

/**
 * 独立时间线右栏「起点」卡：读写**当前选中时间线**的 `description`。
 *
 * - 起点时间（年份 0 / 「元年」）固定不可编辑，本卡不展示时间行，只有描述输入框；
 * - 数据按 `bookId` 定位 `timeline:list:<bookId>`，再以 `activeTimelineId` 选中条目；
 * - 输入框 +「保存描述」按钮，失焦与按钮共用同一个 `handleSave`；
 * - 写入委托页面层 `updateDescription`（只改对应条目，其余条目原样写回，并同步列表态）；
 * - 描述为空时输入框仅显示占位示例，落库仍为空串。
 */
export default function TimelineOriginPanel({
  bookId,
  activeTimelineId,
  onSaveDescription
}: TimelineOriginPanelProps) {
  const { t } = useTranslation('timeline')
  const { t: tCommon } = useTranslation('common')
  const [draft, setDraft] = useState('')
  const [stored, setStored] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // 同步守卫：失焦与按钮点击可能背靠背触发，state 尚未重渲染时也能拦住第二次写入。
  const savingRef = useRef(false)

  const listKey = timelineListKey(bookId)
  const activeKey = timelineActiveKey(bookId)

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.api?.settings.get(listKey), window.api?.settings.get(activeKey)])
      .then(([listRaw, storedActive]) => {
        if (cancelled) return
        const list = parseTimelineList(listRaw ?? null)
        const entry = resolveActiveEntry(list, activeTimelineId ?? storedActive ?? null)
        const entryDescription = entry?.description.trim() ?? ''
        setStored(entryDescription)
        setDraft(entryDescription)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setStored('')
        setDraft('')
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, listKey, activeKey, activeTimelineId])

  const dirty = loaded && draft.trim() !== stored

  const handleSave = async (): Promise<void> => {
    if (!loaded || savingRef.current) return
    const next = draft.trim()
    if (next === stored) {
      setSaved(true)
      return
    }
    savingRef.current = true
    setSaving(true)
    const ok = await onSaveDescription(next)
    savingRef.current = false
    setSaving(false)
    if (!ok) {
      setSaved(false)
      return
    }
    setStored(next)
    setSaved(true)
  }

  return (
    <section className="timeline-card timeline-origin-card on-soft" aria-label={t('originTitle')}>
      <div className="timeline-card__head">
        <span className="timeline-card__title">{t('originTitle')}</span>
      </div>
      <p className="timeline-card__desc">{t('originDesc')}</p>
      <FormField label={t('originDescLabel')} htmlFor="timeline-origin-desc">
        <Input
          id="timeline-origin-desc"
          className="timeline-origin__value"
          value={draft}
          disabled={!loaded}
          spellCheck={false}
          autoComplete="off"
          placeholder={t('originPlaceholder')}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
          onBlur={() => {
            if (dirty) void handleSave()
          }}
        />
      </FormField>
      <div className="timeline-card__actions">
        <Button
          variant="secondary"
          className="wf-btn--on-soft"
          size="sm"
          disabled={!loaded}
          loading={saving}
          onClick={() => void handleSave()}
        >
          {t('originSave')}
        </Button>
        {saved ? (
          <span className="timeline-card__hint is-saved" role="status">
            {t('originSaved')}
          </span>
        ) : !loaded ? (
          <span className="timeline-card__hint">{tCommon('loading')}</span>
        ) : null}
      </div>
    </section>
  )
}
