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
 * 章节回收站视图（中栏）：按卷树形列出被软删的章，支持还原、彻底删除、清空。
 *
 * 数据：`api.chapters.listDeleted(bookId)`。卷集合含两类：① 已删卷（可还原 / 彻底删除）；
 * ② 未删但下有软删章的收拢卷（仅作容器，无卷级操作）。左侧三卡按原卷 kind 分
 * 「分组」（自定义卷）与「正文」（正文卷 / 未分卷）；原卷已被物理删除的章父卷不命中，
 * 作为残差排在「正文」卷树之后。
 * 还原 / 彻底删除 / 清空后，除刷新本视图外，经 `onChanged` 通知页面刷新章节树。
 * 彻底删除与清空为不可恢复操作，走确认弹窗；清空包含已删卷（数据层一并物理删除）。
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
  // 选中行（卷 / 章）；列表刷新后行已不在回收站时自动失效，不残留旧详情。
  const [selection, setSelection] = useState<TrashSelection | null>(null)
  const activeSelection =
    selection !== null &&
    (selection.kind === 'volume'
      ? content.volumes.some((row) => row.id === selection.id)
      : content.chapters.some((row) => row.id === selection.id))
      ? selection
      : null

  const messages: TrashListViewMessages = {
    title: t('trash.title'),
    count: (total) => t('trash.count', { total }),
    purgeAll: t('trash.purgeAll'),
    empty: t('trash.empty'),
    loadingText: tCommon('loading'),
    groupItems: t('trash.groupChapters'),
    restoreVolume: t('trash.restoreVolume'),
    purgeVolume: t('trash.purgeVolume'),
    restoreItem: t('trash.restoreChapter'),
    purgeItem: t('trash.purgeChapter'),
    restoreAfterVolume: t('trash.restoreAfterVolume')
  }

  const chapterName = (chapter: DeletedContent['chapters'][number]): string =>
    labels.chapterLabel(chapter) || t('trash.untitledChapter')

  const volumeName = (volume: DeletedContent['volumes'][number]): string =>
    labels.volumeLabel(volume) || t('trash.detail.untitledVolume')

  // 卷行计数 = 其下仍在回收站中的章数（不是卷内总章数）。
  const deletedChapterCounts = new Map<number, number>()
  for (const chapter of content.chapters) {
    deletedChapterCounts.set(
      chapter.volumeId,
      (deletedChapterCounts.get(chapter.volumeId) ?? 0) + 1
    )
  }

  // 已删卷可还原 / 彻底删除；未删卷仅作收拢容器（`inTrash: false` → 无卷级操作）。
  const volumeRow = (volume: DeletedContent['volumes'][number]): TrashRow => ({
    id: volume.id,
    name: volumeName(volume),
    count: deletedChapterCounts.get(volume.id) ?? 0,
    inTrash: volume.deletedAt !== null,
    emphasis: volume.kind === 'custom' && !volume.isUnfiled
  })

  // 左侧三卡：标题卡 + 「分组」（自定义卷）+「正文」（正文卷 / 未分卷 / 残差章）。
  // 两段都显式 tree：原卷已被物理删除、只剩残差章时仍保留树形残差区。
  const sections = [
    {
      key: 'custom',
      title: t('trash.groupCustom'),
      volumes: content.volumes
        .filter((volume) => volume.kind === 'custom' && !volume.isUnfiled)
        .map(volumeRow),
      tree: true
    },
    {
      key: 'body',
      title: t('trash.groupBody'),
      volumes: content.volumes
        .filter((volume) => volume.kind === 'normal' || volume.isUnfiled)
        .map(volumeRow),
      tree: true
    }
  ]

  const chapters: TrashRow[] = content.chapters.map((chapter) => ({
    id: chapter.id,
    name: chapterName(chapter),
    parentId: chapter.volumeId,
    // 与章节左栏章行对齐：特殊章前段 / 普通章「第X章」、草稿徽标、特殊章名段强调。
    prefix: labels.chapterRowPrefixLabel(chapter),
    badge: chapter.status === 'draft' ? t('status.draft') : undefined,
    showDot: true,
    emphasis: chapter.kind === 'special',
    // 「分组」= 原属自定义卷（排除系统「未分卷」卷）；正文卷 / 未分卷 /
    // 原卷已被物理删除（volumeKind 为 null）/ 异常分组容器一律归「正文」。
    sectionKey: chapter.volumeKind === 'custom' && !chapter.volumeIsUnfiled ? 'custom' : 'body'
  }))

  const requestRestoreVolume = (id: number): void => {
    const volume = content.volumes.find((row) => row.id === id)
    // 未删收拢卷没有卷级操作；操作区已不渲染，这里再做一次防御。
    if (busy || !volume || volume.deletedAt === null) return
    void runAction(() => window.api.chapters.restoreVolume(id))
  }

  const requestPurgeVolume = (id: number): void => {
    const volume = content.volumes.find((row) => row.id === id)
    if (busy || !volume || volume.deletedAt === null) return
    confirm.request(
      {
        title: t('dialog.purgeVolume.title'),
        message: t('dialog.purgeVolume.message', { name: volumeName(volume) }),
        confirmText: t('dialog.purgeVolume.confirm'),
        tone: 'danger'
      },
      () => runAction(() => window.api.chapters.purgeVolume(id))
    )
  }

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
      sections={sections}
      loading={loading}
      loadError={loadError}
      onRetry={() => void reload()}
      busy={busy}
      messages={messages}
      onRestoreVolume={requestRestoreVolume}
      onPurgeVolume={requestPurgeVolume}
      onRestoreItem={requestRestoreChapter}
      onPurgeItem={requestPurgeChapter}
      onPurgeAll={requestPurgeAll}
      selected={activeSelection}
      onSelect={(next) => setSelection(next)}
      detail={
        activeSelection !== null ? (
          <ChapterTrashDetail
            key={`${activeSelection.kind}-${activeSelection.id}`}
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
