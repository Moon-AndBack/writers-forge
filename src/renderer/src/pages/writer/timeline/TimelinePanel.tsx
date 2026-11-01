import { useTranslation } from 'react-i18next'
import type { TimelineEntry } from './timelineOrigin'

export interface TimelinePanelProps {
  /** 时间线列表。 */
  timelines: TimelineEntry[]
  /** 当前选中时间线 id。 */
  activeId: string | null
  /** 选中回调。 */
  onSelect: (id: string) => void
}

export default function TimelinePanel({ timelines, activeId, onSelect }: TimelinePanelProps) {
  const { t } = useTranslation('timeline')

  return (
    <div className="pane-body">
      <div className="pane-scroll">
        {timelines.length === 0 ? (
          <div className="placeholder-view is-compact" role="note">
            <div className="placeholder-title">{t('emptyTitle')}</div>
            <div className="placeholder-desc">{t('emptyDesc')}</div>
          </div>
        ) : (
          <div className="timeline-list pane-region">
            {timelines.map((entry) => {
              const active = entry.id === activeId
              return (
                <div
                  key={entry.id}
                  className={`timeline-item${active ? ' is-active' : ''}`}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className="timeline-item-name">
                    {entry.name.trim() !== '' ? entry.name : t('defaultName')}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
