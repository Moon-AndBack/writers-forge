import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/lib/log'
import { Button, IconButton } from '../../../components/ui'
import { RestoreIcon } from '../icons'
import { TrashIcon } from '../../../components/icons'
import { type VolumeRow } from './chapterTree'
import { useChapterLabels } from './useChapterLabels'
import { useConfirm } from './useConfirm'

/** 回收站视图日志（转发至主进程落盘）。 */
const log = createLogger('ChaptersTrashView')

/** 回收站内容：**直接从 preload `Api` 派生**，消除渲染层平行定义。 */
type DeletedContent = Awaited<ReturnType<Window['api']['chapters']['listDeleted']>>
/** 回收站中的章行（含原归属卷名段 `volumeTitle`）。 */
type DeletedChapterRow = DeletedContent['chapters'][number]

const EMPTY: DeletedContent = { volumes: [], chapters: [] }

/** 拉取回收站内容（纯异步，无 setState）：按 bookId 隔离，供初始加载与刷新复用。 */
async function fetchDeleted(bookId: string): Promise<DeletedContent> {
  const api = window.api?.chapters
  if (!api || bookId === '') return EMPTY
  return api.listDeleted(bookId)
}

export interface ChaptersTrashViewProps {
  /** 书籍 id（路由参数）。 */
  bookId: string
  /** 还原 / 彻底删除 / 清空后回调（页面据此刷新章节树）。 */
  onChanged: () => void
}

/**
 * 回收站视图（中栏）：列出被软删的卷与章，支持还原、彻底删除、清空。
 *
 * 数据：`api.chapters.listDeleted(bookId)`。卷 / 章分组展示；章带原归属卷名。
 * 还原 / 彻底删除 / 清空后，除刷新本视图外，经 `onChanged` 通知页面刷新章节树。
 * 彻底删除与清空为不可恢复操作，走确认弹窗。
 */
export default function ChaptersTrashView({ bookId, onChanged }: ChaptersTrashViewProps) {
  const { t } = useTranslation('chapters')
  const labels = useChapterLabels()
  const [content, setContent] = useState<DeletedContent>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchDeleted(bookId)
      setContent(next)
    } catch (error) {
      log.warn('回收站加载失败', error)
    } finally {
      setLoading(false)
    }
  }, [bookId])

  // 初始 / bookId 变化加载：异步拉取后再 setState（与 useChapterTree 同范式，
  // 不在 effect 体内同步 setState）。
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const next = await fetchDeleted(bookId)
        if (active) setContent(next)
      } catch (error) {
        log.warn('回收站加载失败', error)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [bookId])

  /** 执行一次回收站写操作：成功后刷新本视图并通知章节树。 */
  const runAction = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      setBusy(true)
      try {
        await action()
        await refresh()
        onChanged()
      } catch (error) {
        log.warn('回收站操作失败', error)
      } finally {
        setBusy(false)
      }
    },
    [refresh, onChanged]
  )

  const requestRestoreVolume = (volume: VolumeRow): void => {
    if (busy) return
    void runAction(() => window.api.chapters.restoreVolume(volume.id))
  }

  const requestRestoreChapter = (chapter: DeletedChapterRow): void => {
    if (busy) return
    void runAction(() => window.api.chapters.restore(chapter.id))
  }

  const requestPurgeVolume = (volume: VolumeRow): void => {
    confirm.request(
      {
        title: t('dialog.purgeVolume.title'),
        message: t('dialog.purgeVolume.message', { name: labels.volumeLabel(volume) }),
        confirmText: t('dialog.purgeVolume.confirm'),
        tone: 'danger'
      },
      () => runAction(() => window.api.chapters.purgeVolume(volume.id))
    )
  }

  const requestPurgeChapter = (chapter: DeletedChapterRow): void => {
    confirm.request(
      {
        title: t('dialog.purgeChapter.title'),
        message: t('dialog.purgeChapter.message', { name: labels.chapterLabel(chapter) }),
        confirmText: t('dialog.purgeChapter.confirm'),
        tone: 'danger'
      },
      () => runAction(() => window.api.chapters.purge(chapter.id))
    )
  }

  const requestPurgeAll = (): void => {
    confirm.request(
      {
        title: t('dialog.purgeAll.title'),
        message: t('dialog.purgeAll.message'),
        confirmText: t('dialog.purgeAll.confirm')
      },
      async () => {
        await runAction(() => window.api.chapters.purgeAllDeleted(bookId))
      }
    )
  }

  const total = content.volumes.length + content.chapters.length
  const isEmpty = !loading && total === 0

  return (
    <div className="trash-view">
      <div className="trash-head">
        <span className="trash-title">{t('trash.title')}</span>
        <span className="trash-count">{total > 0 ? t('trash.count', { total }) : ''}</span>
        <span className="spacer" />
        {total > 0 ? (
          <Button variant="ghost" size="sm" onClick={requestPurgeAll} disabled={busy}>
            {t('trash.purgeAll')}
          </Button>
        ) : null}
      </div>

      <div className="trash-scroll">
        <div className="trash-inner">
          {isEmpty ? (
            <div className="trash-empty">{t('trash.empty')}</div>
          ) : (
            <>
              {content.volumes.length > 0 ? (
                <section className="trash-group">
                  <div className="trash-group-title">{t('trash.groupVolumes')}</div>
                  {content.volumes.map((volume) => (
                    <div className="trash-row" key={`v-${volume.id}`}>
                      <span className="trash-row-name">{labels.volumeLabel(volume)}</span>
                      <span className="trash-row-actions">
                        <IconButton
                          size="sm"
                          className="row-act"
                          label={t('trash.restoreVolume')}
                          tooltipPlacement="top"
                          disabled={busy}
                          onClick={() => requestRestoreVolume(volume)}
                        >
                          <RestoreIcon />
                        </IconButton>
                        <IconButton
                          size="sm"
                          className="row-act"
                          tone="danger"
                          label={t('trash.purgeVolume')}
                          tooltipPlacement="top"
                          disabled={busy}
                          onClick={() => requestPurgeVolume(volume)}
                        >
                          <TrashIcon />
                        </IconButton>
                      </span>
                    </div>
                  ))}
                </section>
              ) : null}

              {content.chapters.length > 0 ? (
                <section className="trash-group">
                  <div className="trash-group-title">{t('trash.groupChapters')}</div>
                  {content.chapters.map((chapter) => (
                    <div className="trash-row" key={`c-${chapter.id}`}>
                      <span className="trash-row-main">
                        <span className="trash-row-name">{labels.chapterLabel(chapter)}</span>
                        <span className="trash-row-sub">
                          {chapter.volumeTitle !== null
                            ? chapter.volumeTitle
                            : t('trash.orphanVolume')}
                        </span>
                      </span>
                      <span className="trash-row-actions">
                        <IconButton
                          size="sm"
                          className="row-act"
                          label={t('trash.restoreChapter')}
                          tooltipPlacement="top"
                          disabled={busy}
                          onClick={() => requestRestoreChapter(chapter)}
                        >
                          <RestoreIcon />
                        </IconButton>
                        <IconButton
                          size="sm"
                          className="row-act"
                          tone="danger"
                          label={t('trash.purgeChapter')}
                          tooltipPlacement="top"
                          disabled={busy}
                          onClick={() => requestPurgeChapter(chapter)}
                        >
                          <TrashIcon />
                        </IconButton>
                      </span>
                    </div>
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
      {confirm.node}
    </div>
  )
}
