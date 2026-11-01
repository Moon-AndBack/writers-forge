import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  isStoredOrigin,
  parseTimelineList,
  resolveActiveEntry,
  serializeTimelineList,
  timelineActiveKey,
  timelineListKey,
  type TimelineEntry
} from './timelineOrigin'

export interface TimelineOriginPanelProps {
  /** 书籍 id（路由参数）；按书读写起点键，无书时用裸键兜底。 */
  bookId?: string
  /** 当前选中时间线 id（切换时重新读取对应条目）。 */
  activeTimelineId?: string | null
  /** origin 保存成功后回调（供页面层同步中栏显示）。 */
  onOriginChange?: (origin: string) => void
}

export default function TimelineOriginPanel({
  bookId,
  activeTimelineId,
  onOriginChange
}: TimelineOriginPanelProps) {
  const { t } = useTranslation('timeline')
  const [list, setList] = useState<TimelineEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)

  const listKey = timelineListKey(bookId)
  const activeKey = timelineActiveKey(bookId)

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.api?.settings.get(listKey), window.api?.settings.get(activeKey)])
      .then(([listRaw, storedActive]) => {
        if (cancelled) return
        const parsed = parseTimelineList(listRaw)
        const resolvedActive = activeTimelineId ?? storedActive
        const entry = resolveActiveEntry(parsed, resolvedActive)
        setList(parsed)
        setActiveId(entry?.id ?? null)
        setDraft(entry && isStoredOrigin(entry.origin) ? entry.origin.trim() : t('originDefault'))
        setSaved(false)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setList([])
        setActiveId(activeTimelineId ?? null)
        setDraft(t('originDefault'))
        setSaved(false)
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, listKey, activeKey, activeTimelineId, t])

  const handleSave = () => {
    const next = draft.trim()
    setSaved(false)
    const targetId = activeId ?? activeTimelineId ?? list[0]?.id ?? null
    if (targetId === null) return
    const nextList = list.length > 0 ? list : [{ id: targetId, name: '', origin: '' }]
    const updated = nextList.map((entry) =>
      entry.id === targetId ? { ...entry, origin: next } : entry
    )
    setList(updated)
    void window.api?.settings
      .set(listKey, serializeTimelineList(updated))
      .then(() => {
        setSaved(true)
        onOriginChange?.(next)
      })
      .catch(() => setSaved(false))
  }

  return (
    <div className="plot-editor timeline-origin-panel pane-region">
      <div className="plot-scene-desc">{t('originDesc')}</div>
      <div className="plot-scene-desc">{t('readonlyNote')}</div>
      <label className="plot-field">
        <span className="plot-field-label">{t('originLabel')}</span>
        <input
          className="plot-line-rename"
          type="text"
          value={draft}
          disabled={!loaded}
          spellCheck={false}
          aria-label={t('originAria')}
          placeholder={t('originPlaceholder')}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
          onBlur={handleSave}
        />
      </label>
      <div className="plot-editor-actions">
        <button type="button" className="plot-add-btn" disabled={!loaded} onClick={handleSave}>
          {t('originSave')}
        </button>
        {saved ? <span className="plot-auto-save">{t('originSaved')}</span> : null}
      </div>
      <div className="plot-scene-desc">{t('originEmpty')}</div>
    </div>
  )
}
