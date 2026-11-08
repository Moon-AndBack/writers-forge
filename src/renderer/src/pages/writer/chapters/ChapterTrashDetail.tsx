/**
 * 章节回收站详情（卷 / 章）。
 *
 * 章详情按需读取正文：仅选中时才调 `chapters:getParagraphs`，列表查询不携带全文。
 * 章节保存时 `docToParagraphs` 不写 `contentJson`，故这里按**纯文本段落**渲染
 * （保留空段与段内换行），不为此启动 Tiptap 只读实例。
 * 字数与主进程 / 编辑器同口径（`countCharacters` 有效字数，排除标点 / 空白）。
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactElement } from 'react'
import { Button } from '../../../components/ui'
import type { TrashSelection } from '../../../components/trash/TrashListView'
import { useChapterLabels } from './useChapterLabels'
import { STATUS_LABELS, VOLUME_KIND_LABELS } from './chapterTree'
import { countCharacters } from './docParagraphs'
import { resolveLocale } from '../../../i18n/config'
import { formatDateTime } from '../../../lib/relativeTime'
import type {
  DeletedChapterRow,
  DeletedContent,
  DeletedVolumeRow
} from '../../../../../main/database/chapterTrash'
import type { ParagraphRow } from '../../../../../main/database/paragraphs'

export interface ChapterTrashDetailProps {
  /** 当前选中项（卷 / 章）。 */
  selection: TrashSelection
  /** 回收站内容（用于查行与判断原卷删除态）。 */
  content: DeletedContent
}

/** 详情入口：解析选中行后分派到卷 / 章详情。 */
export function ChapterTrashDetail({ selection, content }: ChapterTrashDetailProps): ReactElement {
  const { t } = useTranslation('chapters')

  if (selection.kind === 'volume') {
    const volume = content.volumes.find((row) => row.id === selection.id)
    if (!volume) return <div className="trash-detail__hint">{t('trash.detail.empty')}</div>
    const chapterCount = content.chapters.filter((row) => row.volumeId === volume.id).length
    return <ChapterVolumeDetail volume={volume} chapterCount={chapterCount} />
  }

  const chapter = content.chapters.find((row) => row.id === selection.id)
  if (!chapter) return <div className="trash-detail__hint">{t('trash.detail.empty')}</div>
  return <ChapterEntryDetail chapter={chapter} content={content} />
}

/** 卷详情：卷名、类型、其下软删章数、删除时间（卷本身无正文）。 */
function ChapterVolumeDetail({
  volume,
  chapterCount
}: {
  volume: DeletedVolumeRow
  chapterCount: number
}): ReactElement {
  const { t, i18n } = useTranslation('chapters')
  const labels = useChapterLabels()
  const locale = resolveLocale(i18n.language)
  const name = labels.volumeLabel(volume) || t('trash.detail.untitledVolume')
  const deletedAt = formatDateTime(volume.deletedAt, locale) || (volume.deletedAt ?? '')

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{name}</div>
        <div className="trash-detail__meta">
          <span>{t('trash.detail.volumeKind', { kind: t(VOLUME_KIND_LABELS[volume.kind]) })}</span>
          <span>{t('trash.detail.deletedChapters', { value: chapterCount })}</span>
          <span>{t('trash.detail.deletedAt', { time: deletedAt })}</span>
        </div>
      </header>
    </div>
  )
}

/** 章详情：元信息 + 按需加载的只读正文。 */
function ChapterEntryDetail({
  chapter,
  content
}: {
  chapter: DeletedChapterRow
  content: DeletedContent
}): ReactElement {
  const { t, i18n } = useTranslation('chapters')
  const labels = useChapterLabels()
  const locale = resolveLocale(i18n.language)

  const [paragraphs, setParagraphs] = useState<ParagraphRow[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)

  // 按需读取正文：仅章详情挂载时拉取；卸载 / 切换章后丢弃迟到结果。
  useEffect(() => {
    let active = true
    void (async (): Promise<void> => {
      try {
        const rows = await window.api.chapters.getParagraphs(chapter.id)
        if (!active) return
        setParagraphs(rows)
        setLoadState('ready')
      } catch {
        if (active) setLoadState('error')
      }
    })()
    return () => {
      active = false
    }
  }, [chapter.id, attempt])

  const retry = (): void => {
    setLoadState('loading')
    setAttempt((value) => value + 1)
  }

  const words = countCharacters(paragraphs.map((row) => row.text))
  const hasText = paragraphs.some((row) => row.text !== '')
  const volumeInTrash = content.volumes.some((row) => row.id === chapter.volumeId)
  const volumeName =
    chapter.volumeTitle !== null && chapter.volumeTitle !== ''
      ? chapter.volumeTitle
      : chapter.volumeTitle === null
        ? t('trash.orphanVolume')
        : t('trash.detail.untitledVolume')
  const deletedAt = formatDateTime(chapter.deletedAt, locale) || (chapter.deletedAt ?? '')

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{labels.chapterLabel(chapter)}</div>
        <div className="trash-detail__meta">
          <span>{t('trash.detail.status', { status: t(STATUS_LABELS[chapter.status]) })}</span>
          {loadState === 'ready' ? (
            <span>{t('trash.detail.wordCount', { value: words })}</span>
          ) : null}
          <span>{t('trash.detail.originalVolume', { name: volumeName })}</span>
          <span>{t('trash.detail.deletedAt', { time: deletedAt })}</span>
        </div>
      </header>

      {volumeInTrash ? (
        <div className="trash-detail__notice">{t('trash.detail.volumeInTrash')}</div>
      ) : null}

      {loadState === 'loading' ? (
        <div className="trash-detail__hint">{t('trash.detail.loading')}</div>
      ) : loadState === 'error' ? (
        <div className="trash-detail__hint">
          <div>{t('trash.detail.loadFailed')}</div>
          <Button
            variant="secondary"
            size="sm"
            className="trash-detail__retry wf-btn--on-soft"
            onClick={retry}
          >
            {t('trash.detail.retry')}
          </Button>
        </div>
      ) : hasText ? (
        <div className="trash-detail__body">
          {paragraphs.map((row) => (
            <p className="trash-detail__para" key={row.id}>
              {row.text}
            </p>
          ))}
        </div>
      ) : (
        <div className="trash-detail__hint">{t('trash.detail.noContent')}</div>
      )}
    </div>
  )
}

export default ChapterTrashDetail
