import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/lib/log'
import { Button, IconButton } from '../../../components/ui'
import { RestoreIcon } from '../icons'
import { TrashIcon } from '../../../components/icons'
import { useConfirm } from '../chapters/useConfirm'
import { useChapterLabels } from '../chapters/useChapterLabels'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'
import { outlineItemLabel } from './outlineTree'
import type { OutlineVolumeRow } from './outlineTree'

/** 回收站视图日志（转发至主进程落盘）。 */
const log = createLogger('OutlineTrashView')

/** 回收站内容：**直接从 preload `Api` 派生**，消除渲染层平行定义。 */
type DeletedContent = Awaited<ReturnType<Window['api']['outline']['listDeleted']>>
/** 回收站中的大纲条目行（含原归属卷名段 `volumeTitle`）。 */
type DeletedOutlineItemRow = DeletedContent['items'][number]

const EMPTY: DeletedContent = { volumes: [], items: [] }

/** 拉取回收站内容（纯异步，无 setState）：按 bookId 隔离，供初始加载与刷新复用。 */
async function fetchDeleted(bookId: string): Promise<DeletedContent> {
  const api = window.api?.outline
  if (!api || bookId === '') return EMPTY
  return api.listDeleted(bookId)
}

export interface OutlineTrashViewProps {
  /** 书籍 id（路由参数）。 */
  bookId: string
  /** 还原 / 彻底删除 / 清空后回调（页面据此刷新大纲树）。 */
  onChanged: () => void
}

/**
 * 大纲回收站视图（中栏）：列出被软删的卷与章，支持还原、彻底删除、清空。
 *
 * 数据：`api.outline.listDeleted(bookId)`。卷 / 章分组展示；章带原归属卷名。
 * 还原 / 彻底删除 / 清空后，除刷新本视图外，经 `onChanged` 通知页面刷新大纲树。
 * 彻底删除与清空为不可恢复操作，走确认弹窗。
 * 与章节回收站（`chapters/ChaptersTrashView`）同形态；差异：大纲卷 / 条目均为纯自定义名
 * （无编号），显示名走 `outlineVolumeLabel` / `outlineItemLabel`。
 */
export default function OutlineTrashView({ bookId, onChanged }: OutlineTrashViewProps) {
  const { t } = useTranslation('chapters')
  const { t: tOutline } = useTranslation('outline')
  const labels = useChapterLabels()
  const [content, setContent] = useState<DeletedContent>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()
  // 彻底删除确认前的双埋点伏笔查询（物理删：外键级联整条删除伏笔）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()

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

  // 初始 / bookId 变化加载：异步拉取后再 setState（与 useOutlineTree 同范式，
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

  /** 执行一次回收站写操作：成功后刷新本视图并通知大纲树。 */
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

  const requestRestoreVolume = (volume: OutlineVolumeRow): void => {
    if (busy) return
    void runAction(() => window.api.outline.restoreVolume(volume.id))
  }

  const requestRestoreChapter = (chapter: DeletedOutlineItemRow): void => {
    if (busy) return
    void runAction(() => window.api.outline.restore(chapter.id))
  }

  const requestPurgeVolume = (volume: OutlineVolumeRow): void => {
    confirm.request(
      {
        title: t('dialog.purgeVolume.title'),
        message: t('dialog.purgeVolume.message', {
          name: labels.outlineVolumeLabel(volume, tOutline('unnamedVolume'))
        }),
        confirmText: t('dialog.purgeVolume.confirm'),
        tone: 'danger'
      },
      () => runAction(() => window.api.outline.purgeVolume(volume.id))
    )
  }

  const requestPurgeChapter = (chapter: DeletedOutlineItemRow): void => {
    // 彻底删除是物理删：伏笔行会随外键 CASCADE 整条消失（含另一处埋设点）。
    void (async (): Promise<void> => {
      const warning = await inspectForeshadowImpact({ outlineItemId: chapter.id }, 'purge')
      confirm.request(
        {
          title: t('dialog.purgeChapter.title'),
          message: withDeleteImpactWarning(
            t('dialog.purgeChapter.message', {
              name: outlineItemLabel(chapter, tOutline('unnamedChapter'))
            }),
            warning
          ),
          confirmText: t('dialog.purgeChapter.confirm'),
          tone: 'danger'
        },
        () => runAction(() => window.api.outline.purge(chapter.id))
      )
    })()
  }

  const requestPurgeAll = (): void => {
    confirm.request(
      {
        title: t('dialog.purgeAll.title'),
        message: t('dialog.purgeAll.message'),
        confirmText: t('dialog.purgeAll.confirm')
      },
      async () => {
        await runAction(() => window.api.outline.purgeAllDeleted(bookId))
      }
    )
  }

  const total = content.volumes.length + content.items.length
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
                      <span className="trash-row-name">
                        {labels.outlineVolumeLabel(volume, tOutline('unnamedVolume'))}
                      </span>
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

              {content.items.length > 0 ? (
                <section className="trash-group">
                  <div className="trash-group-title">{t('trash.groupChapters')}</div>
                  {content.items.map((chapter) => (
                    <div className="trash-row" key={`c-${chapter.id}`}>
                      <span className="trash-row-main">
                        <span className="trash-row-name">
                          {outlineItemLabel(chapter, tOutline('unnamedChapter'))}
                        </span>
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
