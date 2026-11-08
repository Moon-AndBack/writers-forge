/**
 * 大纲域装配 hook：把「大纲条目树（`useOutlineTree`）+ 大纲卷源（`useOutlineVolumes`）+
 * 选中派生 + 大纲动作回调」聚合为一处，供 `Writer.tsx` 一行取用、按原名解构后透传左 / 中栏。
 *
 * 与 `useChapterWorkspace` / `usePlotTimelineBundle` 同款先例：共享卷源 `useVolumes`
 * 仍由页面层持有（章节 / 大纲两域共用同一卷池），其 `renameVolume` / `deleteVolume`
 * 经入参传入——大纲侧改名 / 删除后需额外重取大纲卷源（编号 / 顺序可能变化），故此处包装。
 */
import { useCallback, useMemo, useState } from 'react'
import { useOutlineTree } from './useOutlineTree'
import { useOutlineVolumes, type OutlineVolumeContentRef } from './useOutlineVolumes'
import type { OutlineItemRow, OutlineSelection } from './outlineTree'
import type { VolumeRow } from '../chapters/chapterTree'

/** 大纲域装配态（供 `Writer.tsx` 透传左 / 中栏）。 */
export interface OutlineWorkspace {
  /** 未删除大纲条目（`scope='entry'`：卷下 / 分组下 / 置顶独立条目）。 */
  outlineItems: OutlineItemRow[]
  /** 大纲页可见卷（`normal`+`group`，附动态 `numberIndex`）。 */
  outlineVolumes: VolumeRow[]
  /** 各承载卷纲的卷（正文卷 / 分组）的卷纲载体行（供 EditorPane 解析 contentId）。 */
  outlineVolumeRows: OutlineVolumeContentRef[]
  /** 当前有效选中大纲编辑目标（显式选中仍在列表中则用之，否则回退默认条目）。 */
  activeOutlineSelection: OutlineSelection | null
  /** 重新拉取大纲卷源（卷纲载体）。 */
  reloadOutlineVolumes: () => Promise<void>
  /** 选中大纲编辑目标（左栏行点击 → 中栏编辑）。 */
  handleOpenOutlineTarget: (selection: OutlineSelection) => void
  /** 大纲回收站还原 / 彻底删除 / 清空后：刷新条目树、可见卷与章节侧共享卷列表。 */
  handleOutlineTrashChanged: () => void
  /** 大纲卷 / 分组重命名（走共享卷通道）：成功后重取大纲侧卷。 */
  handleRenameOutlineVolume: (id: number, title: string) => void
  /** 大纲卷 / 分组删除（走共享卷通道）：成功后重取大纲侧卷。 */
  handleDeleteOutlineVolume: (id: number) => void
  /** 新建大纲条目：创建成功后选中新条目。 */
  handleCreateOutlineChapter: (volumeId: number) => void
  /** 新建置顶独立条目（可空名）：创建成功后选中该条目。 */
  handleCreateOutlineNonVolumeChapter: (title: string) => void
  /** 新建分组容器（可空名 = 默认名）：创建后选中该分组行。 */
  handleCreateOutlineGroup: (title: string) => void
  /** 在指定分组容器下新建条目：创建成功后选中该条目。 */
  handleCreateOutlineEntryInGroup: (groupId: number) => void
  /** 重命名大纲条目（走条目通道，就地更新行）。 */
  handleRenameOutlineItem: (id: number, title: string) => void
  /** 软删除大纲条目：成功后重取大纲侧卷。 */
  handleDeleteOutlineChapter: (id: number) => void
  /** 大纲章同卷内重排：成功 hook 内 reload。 */
  handleReorderOutlineChapter: (id: number, targetIndex: number) => void
}

/**
 * 大纲域装配：条目树接库 + 大纲卷源（含分组容器）+ 选中 / 动作回调。
 *
 * `renameVolume` / `deleteVolume` 为页面层共享卷源的写入口（稳定引用，来自 `useVolumes`）；
 * `reloadVolumeList` 为共享卷列表刷新入口（回收站还原 / 物理删除都会改变 `volumes` 表行）。
 */
export function useOutlineWorkspace(
  bookId: string,
  renameVolume: (id: number, title: string) => Promise<void>,
  deleteVolume: (id: number) => Promise<void>,
  reloadVolumeList: () => Promise<void>
): OutlineWorkspace {
  // 大纲树接库：条目 CRUD（卷读写见 `useVolumes` / `useOutlineVolumes`）。
  const {
    chapters: outlineItems,
    reload: reloadOutline,
    createChapter: createOutlineChapter,
    createGroup: createOutlineGroup,
    renameChapter: renameOutlineItem,
    deleteChapter: deleteOutlineChapter,
    reorderChapter: reorderOutlineChapter
  } = useOutlineTree(bookId)
  // 大纲卷源：大纲页可见卷（`normal`+`group`）+ 各承载卷纲的卷（正文卷 / 分组）的卷纲载体行（供 EditorPane 解析 contentId）。
  const {
    volumes: outlineVolumes,
    outlineVolumeRows,
    reload: reloadOutlineVolumes
  } = useOutlineVolumes(bookId)
  // 用户显式选中的大纲编辑目标（null = 尚未选择）；与章节选中互不干扰（切模块各自独立）。
  const [selectedOutlineTarget, setSelectedOutlineTarget] = useState<OutlineSelection | null>(null)
  // 大纲默认编辑目标：首个**置顶独立条目**（`volumeId === null`）。**默认回退仅 `kind='entry'` 参与**：
  // 卷 / 分组选中被删除后不回退到默认条目（保持空态）。
  const defaultOutlineEntryId = useMemo(() => {
    const standalone = outlineItems.find((row) => row.volumeId === null)
    return standalone?.id ?? outlineItems[0]?.id ?? null
  }, [outlineItems])
  const activeOutlineSelection = useMemo<OutlineSelection | null>(() => {
    if (selectedOutlineTarget !== null) {
      const { kind, id } = selectedOutlineTarget
      if (kind === 'volume' || kind === 'group') {
        // 卷 / 分组目标：仍在可见卷池（未删）即有效。
        if (outlineVolumes.some((row) => row.id === id && row.deletedAt === null)) {
          return selectedOutlineTarget
        }
        return null
      }
      if (outlineItems.some((row) => row.id === id)) return selectedOutlineTarget
      return null
    }
    return defaultOutlineEntryId !== null ? { kind: 'entry', id: defaultOutlineEntryId } : null
  }, [selectedOutlineTarget, outlineItems, outlineVolumes, defaultOutlineEntryId])

  /* ---------- 大纲页动作（左栏卷章树 + 中栏编辑共享） ---------- */

  // 选中大纲编辑目标（左栏行点击 → 中栏编辑）。
  const handleOpenOutlineTarget = useCallback((selection: OutlineSelection): void => {
    setSelectedOutlineTarget(selection)
  }, [])

  // 大纲回收站还原 / 彻底删除 / 清空后：刷新大纲条目树与可见卷（卷还原后需重取卷纲载体），
  // 并刷新章节侧共享卷列表（卷池两域共用：还原 / 物理删卷都会改变 `volumes` 表行）。
  const handleOutlineTrashChanged = useCallback((): void => {
    void reloadOutline()
    void reloadOutlineVolumes()
    void reloadVolumeList()
  }, [reloadOutline, reloadOutlineVolumes, reloadVolumeList])

  // 大纲卷 / 分组重命名（走共享卷通道）：成功后重取大纲侧卷（编号 / 顺序可能变化）。
  const handleRenameOutlineVolume = useCallback(
    (id: number, title: string): void => {
      void (async () => {
        await renameVolume(id, title)
        await reloadOutlineVolumes()
      })()
    },
    [renameVolume, reloadOutlineVolumes]
  )

  const handleDeleteOutlineVolume = useCallback(
    (id: number): void => {
      void (async () => {
        await deleteVolume(id)
        await reloadOutlineVolumes()
      })()
    },
    [deleteVolume, reloadOutlineVolumes]
  )

  // 新建大纲条目：创建成功后选中新条目（纯自定义名，默认空名）。
  const handleCreateOutlineChapter = useCallback(
    (volumeId: number): void => {
      void (async () => {
        const created = await createOutlineChapter(volumeId)
        if (created) setSelectedOutlineTarget({ kind: 'entry', id: created.id })
      })()
    },
    [createOutlineChapter]
  )

  // 新建置顶独立条目（可空名 = 空名条目）：创建成功后选中该条目（进入中栏编辑）。
  const handleCreateOutlineNonVolumeChapter = useCallback(
    (title: string): void => {
      void (async () => {
        const created = await createOutlineChapter(null, title)
        if (created) setSelectedOutlineTarget({ kind: 'entry', id: created.id })
      })()
    },
    [createOutlineChapter]
  )

  // 新建分组容器（可空名 = 默认名）：创建后选中该分组行（中栏可编辑其卷纲正文）。
  const handleCreateOutlineGroup = useCallback(
    (title: string): void => {
      void (async () => {
        const created = await createOutlineGroup(title)
        await reloadOutlineVolumes()
        if (created) setSelectedOutlineTarget({ kind: 'group', id: created.id })
      })()
    },
    [createOutlineGroup, reloadOutlineVolumes]
  )

  // 在指定分组容器下新建条目：创建成功后选中该条目。
  const handleCreateOutlineEntryInGroup = useCallback(
    (groupId: number): void => {
      void (async () => {
        const created = await createOutlineChapter(groupId)
        if (created) setSelectedOutlineTarget({ kind: 'entry', id: created.id })
      })()
    },
    [createOutlineChapter]
  )

  // 重命名大纲条目（走条目通道，就地更新行）。
  const handleRenameOutlineItem = useCallback(
    (id: number, title: string): void => {
      void renameOutlineItem(id, title)
    },
    [renameOutlineItem]
  )

  const handleDeleteOutlineChapter = useCallback(
    (id: number): void => {
      void (async () => {
        await deleteOutlineChapter(id)
        await reloadOutlineVolumes()
      })()
    },
    [deleteOutlineChapter, reloadOutlineVolumes]
  )

  // 大纲章同卷内重排：成功 hook 内 reload；失败由 reload 恢复真实序。
  const handleReorderOutlineChapter = useCallback(
    (id: number, targetIndex: number): void => {
      void reorderOutlineChapter(id, targetIndex)
    },
    [reorderOutlineChapter]
  )

  return {
    outlineItems,
    outlineVolumes,
    outlineVolumeRows,
    activeOutlineSelection,
    reloadOutlineVolumes,
    handleOpenOutlineTarget,
    handleOutlineTrashChanged,
    handleRenameOutlineVolume,
    handleDeleteOutlineVolume,
    handleCreateOutlineChapter,
    handleCreateOutlineNonVolumeChapter,
    handleCreateOutlineGroup,
    handleCreateOutlineEntryInGroup,
    handleRenameOutlineItem,
    handleDeleteOutlineChapter,
    handleReorderOutlineChapter
  }
}
