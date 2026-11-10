/**
 * 大纲回收站详情（卷 / 分组 / 条目）。
 *
 * 条目正文已在 `outline:listDeleted` 的 `contentJson` 中返回，选中即用
 * `ReadonlyRichText` 只读渲染，无需额外 IPC 与二次加载。
 * 这里刻意不使用 `EntityReadonlyRichText`：回收站预览不需要设定实体高亮，
 * 避免为整篇正文建立实体词表匹配的开销。
 * 卷 / 分组详情的卷纲正文（`scope='volume'` 行）同样随 `outline:listDeleted`
 * 的卷对象 `contentJson` 返回，与条目详情共用同一只读渲染链路；未删收拢卷
 * 仅作容器、`contentJson` 恒为 null，故不渲染卷纲正文。
 */
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { ReadonlyRichText } from '../../../components/editor/ReadonlyRichText'
import type { TrashSelection } from '../../../components/trash/TrashListView'
import { useChapterLabels } from '../chapters/useChapterLabels'
import { VOLUME_KIND_LABELS } from '../chapters/chapterTree'
import { countCharacters } from '../chapters/docParagraphs'
import { isOutlineItemRestoreBlocked, outlineItemLabel } from './outlineTree'
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
  return <OutlineItemDetail item={item} />
}

/** 卷 / 分组详情：已删卷展示删除时间 + 只读卷纲正文；未删收拢卷只说明收拢用途。 */
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
  const deleted = volume.deletedAt !== null
  const deletedAt = formatDateTime(volume.deletedAt, locale) || (volume.deletedAt ?? '')

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{name}</div>
        <div className="trash-detail__meta">
          <span>{t('trash.detail.volumeKind', { kind: t(VOLUME_KIND_LABELS[volume.kind]) })}</span>
          <span>{t('trash.detail.deletedItems', { value: itemCount })}</span>
          <span>
            {deleted
              ? t('trash.detail.deletedAt', { time: deletedAt })
              : tOutline('trash.volumeNotDeleted')}
          </span>
        </div>
      </header>

      <div className="trash-detail__notice">
        {deleted ? tOutline('trash.volumeDeletedNotice') : tOutline('trash.volumeLiveNotice')}
      </div>

      {/* 未删收拢卷的 contentJson 恒为 null；渲染正文会误显「无正文」，故只对已删卷展示卷纲。 */}
      {deleted ? (
        <div className="trash-detail__body">
          <ReadonlyRichText
            json={volume.contentJson}
            emptyText={t('trash.detail.noContent')}
            className="trash-detail__rich"
          />
        </div>
      ) : null}
    </div>
  )
}

/** 条目详情：元信息 + 只读富文本（`contentJson` 直出）。 */
function OutlineItemDetail({ item }: { item: DeletedOutlineItemRow }): ReactElement {
  const { t, i18n } = useTranslation('chapters')
  const { t: tOutline } = useTranslation('outline')
  const locale = resolveLocale(i18n.language)
  const name = outlineItemLabel(item, tOutline('unnamedChapter'))
  const words = countCharacters([item.text])
  // 父卷状态直接取查询补列：`content.volumes` 现在也含未删收拢卷，
  // 不能再以「父卷 id 是否出现在 volumes」判断父卷是否在回收站。
  const volumeInTrash = item.volumeInTrash
  const restoreBlocked = isOutlineItemRestoreBlocked(item)
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
      {restoreBlocked ? (
        <div className="trash-detail__notice">{tOutline('trash.itemRestoreAfterVolume')}</div>
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
