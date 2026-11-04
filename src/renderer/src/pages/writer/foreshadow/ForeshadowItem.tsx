/**
 * 伏笔列表单卡（中栏网格单元）：四行 ——
 * 1. 名称 + 状态胶囊 + 删除按钮（常显）；
 * 2. 埋点位置（「卷 · 章」完整位置 / 大纲条目名，未锚定显示占位）；
 * 3. 回收位置（同上，未回收显示占位）；
 * 4. 描述摘要（截断）。
 *
 * 卡根为 `<article role="button">`：`<button>` 不能内嵌删除按钮，故改用可聚焦容器 +
 * 键盘（Enter / Space）选中；hover / 选中光晕复用通用 `.wf-card--halo`
 * （仅描边 / 阴影变化，无 transform，AGENTS §8）。删除按钮自身按键不冒泡到卡片。
 */
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '../../../components/icons'
import { IconButton, Tag } from '../../../components/ui'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import { useChapterLabels } from '../chapters/useChapterLabels'
import type { OutlineItemRow } from '../outline/outlineTree'
import {
  foreshadowPlaceLabel,
  FORESHADOW_STATUS_LABEL_KEYS,
  FORESHADOW_STATUS_TONES,
  resolveForeshadowAnchor,
  resolveForeshadowRecoverAnchor,
  type ForeshadowRow
} from './foreshadowTree'

export interface ForeshadowItemProps {
  row: ForeshadowRow
  active: boolean
  /** 未删除章（解析章节锚点目标名 / 失效判定）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（补全章节锚点的「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
  /** 未删除大纲条目（解析大纲锚点目标名 / 失效判定）。 */
  outlineItems: readonly OutlineItemRow[]
  onSelect: (id: number) => void
  /** 请求删除（由中栏视图弹二次确认，本卡不直接落库）。 */
  onDelete: (id: number) => void
}

interface PlaceLineProps {
  label: string
  value: string
  /** 值为占位文案（未锚定 / 未回收 / 失效）时改用弱化色。 */
  empty: boolean
}

/** 单行「位置」：左侧固定标签 + 右侧单行截断值。 */
function PlaceLine({ label, value, empty }: PlaceLineProps) {
  return (
    <div className="foreshadow-item__place">
      <span className="foreshadow-item__place-label">{label}</span>
      <span
        className={`foreshadow-item__place-value${empty ? ' is-empty' : ''}`}
        title={empty ? undefined : value}
      >
        {value}
      </span>
    </div>
  )
}

export default function ForeshadowItem({
  row,
  active,
  chapters,
  volumes,
  outlineItems,
  onSelect,
  onDelete
}: ForeshadowItemProps) {
  const { t } = useTranslation('foreshadow')
  const labels = useChapterLabels()

  const plant = resolveForeshadowAnchor(row, chapters, volumes, outlineItems)
  const recover = resolveForeshadowRecoverAnchor(row, chapters, volumes, outlineItems)

  // 位置串 = 完整锚点位置（章节「卷X 卷名 · 第X章 章名」/ 大纲条目名），
  // 行首已有「埋点位置 / 回收位置」标签，不再重复「章节 ·」前缀。
  const plantTarget = foreshadowPlaceLabel(plant, labels, t('anchor.unnamedTarget'))
  const recoverTarget = foreshadowPlaceLabel(recover, labels, t('anchor.unnamedTarget'))
  const plantText =
    plantTarget ??
    (plant.state === 'invalid' ? t('listItem.anchorInvalid') : t('detail.plantEmpty'))
  const recoverText =
    recoverTarget ??
    (recover.state === 'invalid' ? t('listItem.anchorInvalid') : t('detail.recoverEmpty'))

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    // 只处理卡片自身获得焦点时的按键；卡内删除按钮的 Enter / Space 不触发选中。
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect(row.id)
  }

  return (
    <article
      className={`foreshadow-item wf-card--halo${active ? ' is-active' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={() => onSelect(row.id)}
      onKeyDown={handleKeyDown}
    >
      <div className="foreshadow-item__head">
        <span className="foreshadow-item__title">
          {row.title.trim() === '' ? t('field.untitled') : row.title}
        </span>
        <Tag tone={FORESHADOW_STATUS_TONES[row.status]} className="foreshadow-item__status">
          {t(FORESHADOW_STATUS_LABEL_KEYS[row.status])}
        </Tag>
        <IconButton
          size="sm"
          tone="danger"
          className="foreshadow-item__delete"
          label={t('action.delete')}
          tooltipPlacement="top"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(row.id)
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TrashIcon />
        </IconButton>
      </div>

      <PlaceLine label={t('detail.plant')} value={plantText} empty={plantTarget === null} />
      <PlaceLine label={t('detail.recover')} value={recoverText} empty={recoverTarget === null} />

      {row.description.trim() === '' ? null : (
        <p className="foreshadow-item__desc">{row.description}</p>
      )}
    </article>
  )
}
