/**
 * 大纲回收站详情（卷 / 分组 / 条目）。
 *
 * 条目正文已在 `outline:listDeleted` 的 `contentJson` 中返回，选中即用
 * `ReadonlyRichText` 只读渲染，无需额外 IPC 与二次加载。
 * 这里刻意不使用 `EntityReadonlyRichText`：回收站预览不需要设定实体高亮，
 * 避免为整篇正文建立实体词表匹配的开销。
 * 卷 / 分组详情的卷纲正文（`scope='volume'` 行）同样随 `outline:listDeleted`
 * 的卷对象 `contentJson` 返回，与条目详情共用同一只读渲染链路。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ReadonlyRichText } from '../../../components/editor/ReadonlyRichText'
import type { TrashSelection } from '../../../components/trash/TrashListView'
import { useChapterLabels } from '../chapters/useChapterLabels'
import { VOLUME_KIND_LABELS } from '../chapters/chapterTree'
import { countCharacters } from '../chapters/docParagraphs'
import { outlineItemLabel } from './outlineTree'
import { resolveLocale } from '../../../i18n/config'
import { formatDateTime } from '../../../lib/relativeTime'
import type {
  DeletedOutlineContent,
  DeletedOutlineItemRow,
  DeletedOutlineVolumeRow
} from '../../../../../main/database/outline'

export interface OutlineTrashDetailProps {
  /** 当前选中项（卷 / 条目）。 */
  selection: TrashSelection
  /** 回收站内容（卷含卷纲正文，条目已含 `contentJson` 与原归属卷名）。 */
  content: DeletedOutlineContent
}

/** 详情入口：解析选中行后分派到卷 / 条目详情。 */
export function OutlineTrashDetail({ selection, content }: OutlineTrashDetailProps): ReactElement {
  const { t } = useTranslation('chapters')

  if (selection.kind === 'volume') {
    const volume = content.volumes.find((row) => row.id === selection.id)
    if (!volume) return <div className="trash-detail__hint">{t('trash.detail.empty')}</div>
    const itemCount = content.items.filter((row) => row.volumeId === volume.id).length
    return <OutlineVolumeDetail volume={volume} itemCount={itemCount} />
  }

  const item = content.items.find((row) => row.id === selection.id)
  if (!item) return <div className="trash-detail__hint">{t('trash.detail.empty')}</div>
  return <OutlineItemDetail item={item} content={content} />
}

/** 卷 / 分组详情：名称、kind、其下软删条目数、删除时间 + 只读卷纲正文。 */
function OutlineVolumeDetail({
  volume,
  itemCount
}: {
  volume: DeletedOutlineVolumeRow
  itemCount: number
}): ReactElement {
  const { t, i18n } = useTranslation('chapters')
  const { t: tOutline } = useTranslation('outline')
  const labels = useChapterLabels()
  const locale = resolveLocale(i18n.language)
  const name = labels.outlineVolumeLabel(volume, tOutline('unnamedVolume'))
  const deletedAt = formatDateTime(volume.deletedAt, locale) || (volume.deletedAt ?? '')

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{name}</div>
        <div className="trash-detail__meta">
          <span>{t('trash.detail.volumeKind', { kind: t(VOLUME_KIND_LABELS[volume.kind]) })}</span>
          <span>{t('trash.detail.deletedItems', { value: itemCount })}</span>
          <span>{t('trash.detail.deletedAt', { time: deletedAt })}</span>
        </div>
      </header>

      <div className="trash-detail__body">
        <ReadonlyRichText
          json={volume.contentJson}
          emptyText={t('trash.detail.noContent')}
          className="trash-detail__rich"
        />
      </div>
    </div>
  )
}

/** 条目详情：元信息 + 只读富文本（`contentJson` 直出）。 */
function OutlineItemDetail({
  item,
  content
}: {
  item: DeletedOutlineItemRow
  content: DeletedOutlineContent
}): ReactElement {
  const { t, i18n } = useTranslation('chapters')
  const { t: tOutline } = useTranslation('outline')
  const locale = resolveLocale(i18n.language)
  const name = outlineItemLabel(item, tOutline('unnamedChapter'))
  const words = countCharacters([item.text])
  const volumeInTrash =
    item.volumeId !== null && content.volumes.some((row) => row.id === item.volumeId)
  const volumeName = originalVolumeLabel(item, {
    standalone: t('trash.detail.standalone'),
    orphan: t('trash.orphanVolume'),
    untitled: tOutline('unnamedVolume')
  })
  const deletedAt = formatDateTime(item.deletedAt, locale) || (item.deletedAt ?? '')

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{name}</div>
        <div className="trash-detail__meta">
          <span>{t('trash.detail.wordCount', { value: words })}</span>
          <span>{t('trash.detail.originalVolume', { name: volumeName })}</span>
          <span>{t('trash.detail.deletedAt', { time: deletedAt })}</span>
        </div>
      </header>

      {volumeInTrash ? (
        <div className="trash-detail__notice">{t('trash.detail.volumeInTrash')}</div>
      ) : null}

      <div className="trash-detail__body">
        <ReadonlyRichText
          json={item.contentJson}
          emptyText={t('trash.detail.noContent')}
          className="trash-detail__rich"
        />
      </div>
    </div>
  )
}

/** 原归属名：独立条目 / 原卷已删除 / 未命名卷 三种回退。 */
function originalVolumeLabel(
  item: Pick<DeletedOutlineItemRow, 'volumeId' | 'volumeTitle'>,
  labels: { standalone: string; orphan: string; untitled: string }
): string {
  if (item.volumeId === null) return labels.standalone
  if (item.volumeTitle === null) return labels.orphan
  return item.volumeTitle === '' ? labels.untitled : item.volumeTitle
}

export default OutlineTrashDetail
