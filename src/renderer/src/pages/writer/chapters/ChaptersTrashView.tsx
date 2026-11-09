import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashListView } from '../../../components/trash/TrashListView'
import type {
  TrashListViewMessages,
  TrashRow,
  TrashSelection
} from '../../../components/trash/TrashListView'
import { useTrashData } from '../useTrashData'
import { useChapterLabels } from './useChapterLabels'
import { useConfirm } from './useConfirm'
import { ChapterTrashDetail } from './ChapterTrashDetail'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'

/** 回收站内容：**直接从 preload `Api` 派生**，消除渲染层平行定义。 */
type DeletedContent = Awaited<ReturnType<Window['api']['chapters']['listDeleted']>>

const EMPTY: DeletedContent = { chapters: [] }

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
 * 回收站视图（中栏）：**平铺列出被软删的章**，支持还原、彻底删除、清空。
 *
 * 数据：`api.chapters.listDeleted(bookId)`。第三批起章节回收站舍弃卷设计——
 * 只列章、不列卷；已删除的卷只在大纲回收站管理。「清空」也只彻底删除章，
 * 不动软删卷与大纲条目。
 * 还原 / 彻底删除 / 清空后，除刷新本视图外，经 `onChanged` 通知页面刷新章节树。
 * 彻底删除与清空为不可恢复操作，走确认弹窗。
 * 列表展示与数据加载 / 写操作分别收敛到 `TrashListView` / `useTrashData`；
 * 本视图只保留章节域的 API 适配、名称解析、确认文案与伏笔目标。
 */
export default function ChaptersTrashView({ bookId, onChanged }: ChaptersTrashViewProps) {
  const { t } = useTranslation('chapters')
  const { t: tCommon } = useTranslation('common')
  const labels = useChapterLabels()
  const confirm = useConfirm()
  // 彻底删除确认前的双埋点伏笔查询（物理删：外键级联整条删除伏笔）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()
  const { content, loading, loadError, busy, runAction, reload } = useTrashData({
    bookId,
    initial: EMPTY,
    load: fetchDeleted,
    onChanged,
    logger: 'ChaptersTrashView'
  })
  // 选中行（仅章）；列表刷新后行已不在回收站时自动失效，不残留旧详情。
  const [selection, setSelection] = useState<TrashSelection | null>(null)
  const activeSelection =
    selection !== null &&
    selection.kind === 'item' &&
    content.chapters.some((row) => row.id === selection.id)
      ? selection
      : null

  const messages: TrashListViewMessages = {
    title: t('trash.title'),
    count: (total) => t('trash.count', { total }),
    purgeAll: t('trash.purgeAll'),
    empty: t('trash.empty'),
    loadingText: tCommon('loading'),
    groupItems: t('trash.groupChapters'),
    restoreItem: t('trash.restoreChapter'),
    purgeItem: t('trash.purgeChapter')
  }

  const chapterName = (chapter: DeletedContent['chapters'][number]): string =>
    labels.chapterLabel(chapter) || t('trash.untitledChapter')

  const chapters: TrashRow[] = content.chapters.map((chapter) => ({
    id: chapter.id,
    name: chapterName(chapter)
  }))

  const requestRestoreChapter = (id: number): void => {
    if (busy) return
    void runAction(() => window.api.chapters.restore(id))
  }

  const requestPurgeChapter = (id: number): void => {
    const chapter = content.chapters.find((row) => row.id === id)
    if (!chapter) return
    // 彻底删除是物理删：伏笔行会随外键 CASCADE 整条消失（含另一处埋设点）。
    void (async (): Promise<void> => {
      const warning = await inspectForeshadowImpact({ chapterId: chapter.id }, 'purge')
      confirm.request(
        {
          title: t('dialog.purgeChapter.title'),
          message: withDeleteImpactWarning(
            t('dialog.purgeChapter.message', { name: chapterName(chapter) }),
            warning
          ),
          confirmText: t('dialog.purgeChapter.confirm'),
          tone: 'danger'
        },
        () => runAction(() => window.api.chapters.purge(chapter.id))
      )
    })()
  }

  const requestPurgeAll = (): void => {
    confirm.request(
      {
        title: t('dialog.purgeAll.title'),
        message: t('dialog.purgeAll.chapterMessage'),
        confirmText: t('dialog.purgeAll.confirm')
      },
      async () => {
        await runAction(() => window.api.chapters.purgeAllDeleted(bookId))
      }
    )
  }

  return (
    <TrashListView
      items={chapters}
      loading={loading}
      loadError={loadError}
      onRetry={() => void reload()}
      busy={busy}
      messages={messages}
      onRestoreItem={requestRestoreChapter}
      onPurgeItem={requestPurgeChapter}
      onPurgeAll={requestPurgeAll}
      selected={activeSelection}
      onSelect={(next) => setSelection(next)}
      detail={
        activeSelection !== null ? (
          <ChapterTrashDetail
            key={`item-${activeSelection.id}`}
            selection={activeSelection}
            content={content}
          />
        ) : undefined
      }
      detailEmpty={<div className="trash-detail__empty">{t('trash.detail.empty')}</div>}
      footer={confirm.node}
    />
  )
}
