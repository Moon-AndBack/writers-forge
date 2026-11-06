import { useTranslation } from 'react-i18next'
import { TrashListView } from '../../../components/trash/TrashListView'
import type { TrashListViewMessages, TrashRow } from '../../../components/trash/TrashListView'
import { useTrashData } from '../useTrashData'
import { useConfirm } from '../chapters/useConfirm'
import { useChapterLabels } from '../chapters/useChapterLabels'
import {
  useForeshadowDeleteImpact,
  withDeleteImpactWarning
} from '../foreshadow/useForeshadowDeleteImpact'
import { outlineItemLabel } from './outlineTree'

/** 回收站内容：**直接从 preload `Api` 派生**，消除渲染层平行定义。 */
type DeletedContent = Awaited<ReturnType<Window['api']['outline']['listDeleted']>>

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
 * 大纲回收站视图（中栏）：列出被软删的卷与条目，支持还原、彻底删除、清空。
 *
 * 数据：`api.outline.listDeleted(bookId)`。卷 / 条目分组展示；条目带原归属卷名。
 * 还原 / 彻底删除 / 清空后，除刷新本视图外，经 `onChanged` 通知页面刷新大纲树
 * （调用方 `OutlineEditor` 在该回调内一并执行 `onRefreshVolumes`）。
 * 与章节回收站的差异：大纲卷 / 条目均为纯自定义名（无编号），显示名走
 * `outlineVolumeLabel` / `outlineItemLabel`，空名回退 `outline:unnamed*`。
 * 列表展示与数据加载 / 写操作分别收敛到 `TrashListView` / `useTrashData`；
 * 本视图只保留大纲域的 API 适配、名称解析、确认文案与伏笔目标。
 */
export default function OutlineTrashView({ bookId, onChanged }: OutlineTrashViewProps) {
  const { t } = useTranslation('chapters')
  const { t: tOutline } = useTranslation('outline')
  const labels = useChapterLabels()
  const confirm = useConfirm()
  // 彻底删除确认前的双埋点伏笔查询（物理删：外键级联整条删除伏笔）。
  const { inspect: inspectForeshadowImpact } = useForeshadowDeleteImpact()
  const { content, loading, busy, runAction } = useTrashData({
    bookId,
    initial: EMPTY,
    load: fetchDeleted,
    onChanged,
    logger: 'OutlineTrashView'
  })

  const messages: TrashListViewMessages = {
    title: t('trash.title'),
    count: (total) => t('trash.count', { total }),
    purgeAll: t('trash.purgeAll'),
    empty: t('trash.empty'),
    groupVolumes: t('trash.groupVolumes'),
    groupItems: t('trash.groupChapters'),
    restoreVolume: t('trash.restoreVolume'),
    purgeVolume: t('trash.purgeVolume'),
    restoreItem: t('trash.restoreChapter'),
    purgeItem: t('trash.purgeChapter')
  }

  const volumes: TrashRow[] = content.volumes.map((volume) => ({
    id: volume.id,
    name: labels.outlineVolumeLabel(volume, tOutline('unnamedVolume'))
  }))
  const items: TrashRow[] = content.items.map((item) => ({
    id: item.id,
    name: outlineItemLabel(item, tOutline('unnamedChapter')),
    sub: item.volumeTitle !== null ? item.volumeTitle : t('trash.orphanVolume')
  }))

  const requestRestoreVolume = (id: number): void => {
    if (busy) return
    void runAction(() => window.api.outline.restoreVolume(id))
  }

  const requestRestoreItem = (id: number): void => {
    if (busy) return
    void runAction(() => window.api.outline.restore(id))
  }

  const requestPurgeVolume = (id: number): void => {
    const volume = content.volumes.find((row) => row.id === id)
    if (!volume) return
    confirm.request(
      {
        title: t('dialog.purgeVolume.title'),
        message: t('dialog.purgeVolume.message', {
          name: labels.outlineVolumeLabel(volume, tOutline('unnamedVolume'))
        }),
        confirmText: t('dialog.purgeVolume.confirm'),
        tone: 'danger'
      },
      () => runAction(() => window.api.outline.purgeVolume(id))
    )
  }

  const requestPurgeItem = (id: number): void => {
    const item = content.items.find((row) => row.id === id)
    if (!item) return
    // 彻底删除是物理删：伏笔行会随外键 CASCADE 整条消失（含另一处埋设点）。
    void (async (): Promise<void> => {
      const warning = await inspectForeshadowImpact({ outlineItemId: item.id }, 'purge')
      confirm.request(
        {
          title: t('dialog.purgeChapter.title'),
          message: withDeleteImpactWarning(
            t('dialog.purgeChapter.message', {
              name: outlineItemLabel(item, tOutline('unnamedChapter'))
            }),
            warning
          ),
          confirmText: t('dialog.purgeChapter.confirm'),
          tone: 'danger'
        },
        () => runAction(() => window.api.outline.purge(item.id))
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

  return (
    <TrashListView
      volumes={volumes}
      items={items}
      loading={loading}
      busy={busy}
      messages={messages}
      onRestoreVolume={requestRestoreVolume}
      onPurgeVolume={requestPurgeVolume}
      onRestoreItem={requestRestoreItem}
      onPurgeItem={requestPurgeItem}
      onPurgeAll={requestPurgeAll}
      footer={confirm.node}
    />
  )
}
