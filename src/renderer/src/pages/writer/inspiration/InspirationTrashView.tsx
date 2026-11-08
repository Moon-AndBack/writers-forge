import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashListView } from '../../../components/trash/TrashListView'
import type {
  TrashListViewMessages,
  TrashRow,
  TrashSelection
} from '../../../components/trash/TrashListView'
import { useTrashData } from '../useTrashData'
import { useConfirm } from '../chapters/useConfirm'
import { InspirationTrashDetail } from './InspirationTrashDetail'

/** 回收站内容：**直接从 preload `Api` 派生**，消除渲染层平行定义。 */
type DeletedContent = Awaited<ReturnType<Window['api']['inspiration']['listDeleted']>>

/** 稳定空内容 / 空分组（`volumes` 恒空，灵感没有卷层级）。 */
const EMPTY: DeletedContent = []
const EMPTY_VOLUMES: TrashRow[] = []

/** 拉取回收站内容（纯异步，无 setState）：按 bookId 隔离，供初始加载与刷新复用。 */
async function fetchDeleted(bookId: string): Promise<DeletedContent> {
  const api = window.api?.inspiration
  if (!api || bookId === '') return EMPTY
  return api.listDeleted(bookId)
}

export interface InspirationTrashViewProps {
  /** 书籍 id（装配包提供）。 */
  bookId: string
  /** 还原 / 彻底删除 / 清空后回调（页面据此刷新灵感列表与标签）。 */
  onChanged: () => void
}

/**
 * 灵感回收站视图（中栏）：列出被软删的灵感，支持还原、彻底删除、清空。
 *
 * 数据：`api.inspiration.listDeleted(bookId)`。灵感没有卷 / 分组层级，故只填
 * `TrashListView` 的 `items` 分组（`volumes` 恒空）；行主名为标题（空标题回退
 * 「未命名灵感」），次要行为标签（` · ` 连接，无标签不占行）。
 * 列表展示与数据加载 / 写操作分别收敛到 `TrashListView` / `useTrashData`；
 * 本视图只保留灵感域的 API 适配、名称解析与确认文案。
 */
export default function InspirationTrashView({ bookId, onChanged }: InspirationTrashViewProps) {
  const { t } = useTranslation('inspiration')
  const { t: tChapters } = useTranslation('chapters')
  const confirm = useConfirm()
  const { content, loading, busy, runAction } = useTrashData({
    bookId,
    initial: EMPTY,
    load: fetchDeleted,
    onChanged,
    logger: 'InspirationTrashView'
  })
  // 选中行；列表刷新后行已不在回收站时由 `activeSelection` 自动失效，不残留旧详情。
  const [selection, setSelection] = useState<TrashSelection | null>(null)
  const activeSelection =
    selection !== null &&
    selection.kind === 'item' &&
    content.some((row) => row.id === selection.id)
      ? selection
      : null
  const activeRow =
    activeSelection === null ? null : (content.find((row) => row.id === activeSelection.id) ?? null)

  const messages: TrashListViewMessages = {
    title: t('trash.title'),
    // 计数 / 空态 / 清空按钮与章节回收站语义一致，直接复用 chapters ns。
    count: (total) => tChapters('trash.count', { total }),
    purgeAll: tChapters('trash.purgeAll'),
    empty: tChapters('trash.empty'),
    groupVolumes: tChapters('trash.groupVolumes'),
    groupItems: t('trash.groupItems'),
    restoreVolume: tChapters('trash.restoreVolume'),
    purgeVolume: tChapters('trash.purgeVolume'),
    restoreItem: t('trash.restoreItem'),
    purgeItem: t('trash.purgeItem')
  }

  const label = (row: DeletedContent[number]): string =>
    row.title.trim() === '' ? t('field.untitled') : row.title

  const items: TrashRow[] = content.map((row) => ({
    id: row.id,
    name: label(row),
    sub: row.tags.length > 0 ? row.tags.join(' · ') : undefined
  }))

  const requestRestore = (id: number): void => {
    if (busy) return
    void runAction(() => window.api.inspiration.restore(id))
  }

  const requestPurge = (id: number): void => {
    const row = content.find((item) => item.id === id)
    if (!row) return
    confirm.request(
      {
        title: t('trash.dialog.purge.title'),
        message: t('trash.dialog.purge.message', { name: label(row) }),
        confirmText: t('trash.dialog.purge.confirm'),
        tone: 'danger'
      },
      () => runAction(() => window.api.inspiration.purge(id))
    )
  }

  const requestPurgeAll = (): void => {
    confirm.request(
      {
        title: t('trash.dialog.purgeAll.title'),
        message: t('trash.dialog.purgeAll.message'),
        confirmText: t('trash.dialog.purgeAll.confirm')
      },
      () => runAction(() => window.api.inspiration.purgeAllDeleted(bookId))
    )
  }

  return (
    <TrashListView
      volumes={EMPTY_VOLUMES}
      items={items}
      loading={loading}
      busy={busy}
      messages={messages}
      onRestoreVolume={() => undefined}
      onPurgeVolume={() => undefined}
      onRestoreItem={requestRestore}
      onPurgeItem={requestPurge}
      onPurgeAll={requestPurgeAll}
      selected={activeSelection}
      onSelect={(next) => setSelection(next)}
      detail={
        activeRow === null ? undefined : (
          <InspirationTrashDetail key={activeRow.id} row={activeRow} />
        )
      }
      detailEmpty={<div className="trash-detail__empty">{tChapters('trash.detail.empty')}</div>}
      footer={confirm.node}
    />
  )
}
