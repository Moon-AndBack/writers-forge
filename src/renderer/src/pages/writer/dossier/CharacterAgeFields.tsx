import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FormField, Input, Select } from '../../../components/ui'
import type { CharacterAgeAnchor } from '../../../../../preload/types/worldEntity'
import {
  DEFAULT_TIMELINE_ID,
  parseTimelineList,
  resolveActiveEntry,
  timelineActiveKey,
  timelineListKey,
  type TimelineEntry
} from '../timeline/timelineOrigin'
import {
  absoluteYearFromEra,
  birthYearFromAnchor,
  eraYearFromAbsolute,
  formatAnchorYear,
  parseIntegerText,
  type AgeEra
} from './characterAge'

export interface CharacterAgeFieldsProps {
  /** 当前书 id（时间线列表 / 激活项按书隔离）。 */
  bookId: string
  /** 当前角色实体 id（生成控件 id）。 */
  entityId: number
  /** 草稿中的锚点（受控真源）。 */
  values: CharacterAgeAnchor[]
  /** 草稿变更（整体锚点数组；只写父级草稿，不直接写库）。 */
  onChange: (anchors: CharacterAgeAnchor[]) => void
}

/** 单条时间线的输入态（`''` = 未设置；年份 / 年龄保留原文供中途为空）。 */
interface AgeRow {
  era: AgeEra
  yearText: string
  ageText: string
}

const EMPTY_ROW: AgeRow = { era: '', yearText: '', ageText: '' }

/** 锚点 → 输入态（元年年份框留空）。 */
function rowFromAnchor(anchor: CharacterAgeAnchor): AgeRow {
  const { era, year } = eraYearFromAbsolute(anchor.anchorYear)
  return { era, yearText: year === null ? '' : String(year), ageText: String(anchor.age) }
}

/** 输入态 → 锚点；纪元 / 年份 / 年龄任一不完整返回 null。 */
function anchorFromRow(timelineId: string, row: AgeRow): CharacterAgeAnchor | null {
  const age = parseIntegerText(row.ageText)
  if (age === null || age < 0) return null
  const anchorYear = absoluteYearFromEra(row.era, parseIntegerText(row.yearText))
  if (anchorYear === null) return null
  return { timelineId, anchorYear, age }
}

/**
 * 角色年龄锚点编辑块（仅角色右栏）。
 *
 * 时间线下拉默认当前激活时间线；每条时间线独立一个「某年多少岁」锚点。
 * 三个值齐全才写入草稿（父级保存时随补丁落库），并根据锚点实时推算出生年。
 * 所有文案走 `dossier` ns；纪元名复用 `plot` ns，时间线默认名复用 `timeline` ns。
 */
export default function CharacterAgeFields({
  bookId,
  entityId,
  values,
  onChange
}: CharacterAgeFieldsProps) {
  const { t } = useTranslation('dossier')
  const { t: tPlot } = useTranslation('plot')
  const { t: tTimeline } = useTranslation('timeline')

  const [timelines, setTimelines] = useState<TimelineEntry[]>([
    { id: DEFAULT_TIMELINE_ID, name: '', origin: '', originName: '', description: '' }
  ])
  const [selectedId, setSelectedId] = useState(DEFAULT_TIMELINE_ID)
  // 已编辑过的输入态（含未填完的中间态）；未出现的时间线回落到草稿锚点。
  const [rows, setRows] = useState<Record<string, AgeRow>>(() => {
    const initial: Record<string, AgeRow> = {}
    for (const anchor of values) initial[anchor.timelineId] = rowFromAnchor(anchor)
    return initial
  })

  // 时间线列表 + 激活 id 与时间线模块同源（settings 键按书隔离）。
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      window.api?.settings.get(timelineListKey(bookId)),
      window.api?.settings.get(timelineActiveKey(bookId))
    ])
      .then(([listRaw, activeRaw]) => {
        if (cancelled) return
        const parsed = parseTimelineList(listRaw ?? null)
        const list: TimelineEntry[] =
          parsed.length > 0
            ? parsed
            : [
                {
                  id: DEFAULT_TIMELINE_ID,
                  name: '',
                  origin: '',
                  originName: '',
                  description: ''
                }
              ]
        setTimelines(list)
        setSelectedId(resolveActiveEntry(list, activeRaw ?? null)?.id ?? DEFAULT_TIMELINE_ID)
      })
      .catch(() => {
        // 读取失败：保留默认时间线占位，不阻断年龄编辑。
      })
    return () => {
      cancelled = true
    }
  }, [bookId])

  const activeRow = useMemo(() => {
    const row = rows[selectedId]
    if (row) return row
    const anchor = values.find((item) => item.timelineId === selectedId)
    return anchor ? rowFromAnchor(anchor) : EMPTY_ROW
  }, [rows, selectedId, values])

  const timelineOptions = useMemo(
    () =>
      timelines.map((entry) => ({
        value: entry.id,
        label: entry.name.trim() !== '' ? entry.name : tTimeline('defaultName')
      })),
    [timelines, tTimeline]
  )

  const eraOptions = useMemo(
    () => [
      { value: '', label: t('detail.characterAge.eraUnset') },
      { value: 'bc', label: tPlot('timeEra.bc') },
      { value: 'zero', label: tPlot('timeEra.zero') },
      { value: 'ad', label: tPlot('timeEra.ad') }
    ],
    [t, tPlot]
  )

  const previewAnchor = anchorFromRow(selectedId, activeRow)
  const birthYear = previewAnchor ? birthYearFromAnchor(previewAnchor) : null

  const applyRow = (patch: Partial<AgeRow>): void => {
    const nextRow = { ...activeRow, ...patch }
    setRows((prev) => ({ ...prev, [selectedId]: nextRow }))
    const anchor = anchorFromRow(selectedId, nextRow)
    const rest = values.filter((item) => item.timelineId !== selectedId)
    onChange(anchor ? [...rest, anchor] : rest)
  }

  const handleEraChange = (value: string): void => {
    const era: AgeEra = value === 'bc' || value === 'zero' || value === 'ad' ? value : ''
    // 元年无年份：清空年份框（与剧情场景编辑器同口径）。
    applyRow(era === 'zero' ? { era, yearText: '' } : { era })
  }

  // 切换时间线：严格回填该线已有锚点，没有则清空（不保留其它线未完成输入）。
  const handleTimelineChange = (id: string): void => {
    const anchor = values.find((item) => item.timelineId === id)
    setRows((prev) => ({ ...prev, [id]: anchor ? rowFromAnchor(anchor) : EMPTY_ROW }))
    setSelectedId(id)
  }

  const timelineId = `character-age-timeline-${entityId}`
  const eraId = `character-age-era-${entityId}`
  const yearId = `character-age-year-${entityId}`
  const ageId = `character-age-age-${entityId}`
  const yearDisabled = activeRow.era === '' || activeRow.era === 'zero'

  return (
    <div className="dossier-detail__section dossier-age-fields">
      <p className="dossier-detail__label">{t('detail.characterAge.title')}</p>

      <FormField label={t('detail.characterAge.timeline')} htmlFor={timelineId}>
        <Select
          id={timelineId}
          value={selectedId}
          options={timelineOptions}
          onChange={handleTimelineChange}
        />
      </FormField>

      <FormField label={t('detail.characterAge.era')} htmlFor={eraId}>
        <Select id={eraId} value={activeRow.era} options={eraOptions} onChange={handleEraChange} />
      </FormField>

      <FormField label={t('detail.characterAge.year')} htmlFor={yearId}>
        <Input
          id={yearId}
          type="number"
          min={0}
          step={1}
          value={activeRow.yearText}
          placeholder={t('detail.characterAge.yearPlaceholder')}
          disabled={yearDisabled}
          autoComplete="off"
          onChange={(event) => applyRow({ yearText: event.target.value })}
        />
      </FormField>

      <FormField label={t('detail.characterAge.age')} htmlFor={ageId}>
        <Input
          id={ageId}
          type="number"
          min={0}
          step={1}
          value={activeRow.ageText}
          placeholder={t('detail.characterAge.agePlaceholder')}
          autoComplete="off"
          onChange={(event) => applyRow({ ageText: event.target.value })}
        />
      </FormField>

      <p className="dossier-age-hint">
        {birthYear !== null
          ? t('detail.characterAge.birthYear', { year: formatAnchorYear(birthYear, tPlot) })
          : t('detail.characterAge.unsetHint')}
      </p>
    </div>
  )
}
