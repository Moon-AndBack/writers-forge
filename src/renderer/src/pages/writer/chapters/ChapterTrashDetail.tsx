/**
 * 章节回收站详情（仅章）。
 *
 * 第三批起章节回收站只列章，卷详情分支已删除（已删除的卷只在大纲回收站管理）。
 * 章详情展示原卷状态与还原去向：原卷可用 → 原卷末尾；原卷也在回收站 / 原卷已删除 /
 * 原卷为系统「未分卷」→ 未分卷末尾（与 `restoreChapter` 的目标卷判定一致）。
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
import { STATUS_LABELS } from './chapterTree'
import { countCharacters } from './docParagraphs'
import { resolveLocale } from '../../../i18n/config'
import { formatDateTime } from '../../../lib/relativeTime'
import type { DeletedChapterRow, DeletedContent } from '../../../../../main/database/chapterTrash'
import type { ParagraphRow } from '../../../../../main/database/paragraphs'

export interface ChapterTrashDetailProps {
  /** 当前选中项（章节回收站只产生 item 选中）。 */
  selection: TrashSelection
  /** 回收站内容（用于查章）。 */
  content: DeletedContent
}

/** 详情入口：解析选中章后渲染章详情。 */
export function ChapterTrashDetail({ selection, content }: ChapterTrashDetailProps): ReactElement {
  const { t } = useTranslation('chapters')

  const chapter = content.chapters.find((row) => row.id === selection.id)
  if (!chapter) return <div className="trash-detail__hint">{t('trash.detail.empty')}</div>
  return <ChapterEntryDetail chapter={chapter} />
}

/** 章详情：元信息 + 还原去向 + 按需加载的只读正文。 */
function ChapterEntryDetail({ chapter }: { chapter: DeletedChapterRow }): ReactElement {
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
  const chapterName = labels.chapterLabel(chapter) || t('trash.untitledChapter')
  // 原卷状态：系统未分卷 → 未分卷；卷缺失 → 原卷已删除；否则原卷名（空名回退未命名卷）。
  const volumeName = chapter.volumeIsUnfiled
    ? t('trash.unfiledVolume')
    : chapter.volumeTitle === null
      ? t('trash.orphanVolume')
      : chapter.volumeTitle === ''
        ? t('trash.detail.untitledVolume')
        : chapter.volumeTitle
  // 还原去向与 `restoreChapter` 判定一致：原卷可用 → 原卷末尾；否则 → 未分卷末尾。
  // 原卷也在回收站时，合并成一条「原卷也在回收站，还原后进入未分卷」提示。
  const restoreNotice = chapter.volumeInTrash
    ? t('trash.detail.chapterVolumeInTrash')
    : chapter.volumeIsUnfiled || chapter.volumeTitle === null
      ? t('trash.detail.restoreToUnfiled')
      : t('trash.detail.restoreToVolume')
  const deletedAt = formatDateTime(chapter.deletedAt, locale) || (chapter.deletedAt ?? '')

  return (
    <div className="trash-detail__pane">
      <header className="trash-detail__head">
        <div className="trash-detail__title">{chapterName}</div>
        <div className="trash-detail__meta">
          <span>{t('trash.detail.status', { status: t(STATUS_LABELS[chapter.status]) })}</span>
          {loadState === 'ready' ? (
            <span>{t('trash.detail.wordCount', { value: words })}</span>
          ) : null}
          <span>{t('trash.detail.originalVolume', { name: volumeName })}</span>
          <span>{t('trash.detail.deletedAt', { time: deletedAt })}</span>
        </div>
      </header>

      <div className="trash-detail__notice">{restoreNotice}</div>

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
