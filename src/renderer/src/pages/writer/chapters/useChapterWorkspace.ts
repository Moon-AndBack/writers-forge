/**
 * 章节域装配 hook：把「章节树数据源（`useChapterTree`）+ 选中 / 回收站视图状态 +
 * 派生选中 + 容量判定 + 章节动作回调」聚合为一处，供 `Writer.tsx` 一行取用、
 * 按原名解构后透传左 / 中栏。
 *
 * 与 `useOutlineWorkspace` / `usePlotTimelineBundle` 同款先例：卷读写仍由页面层的
 * 共享卷源 `useVolumes` 持有（章节 / 大纲两域共用同一卷池），此处只装配章域，不改行为。
 * 章节模块状态栏（`useChapterStatusBar`）依赖共享卷源，仍在页面层调用。
 */
import { useCallback, useMemo, useState } from 'react'
import { MAX_CHAPTERS_PER_VOLUME } from './chapterTree'
import type { ChapterPin, ChapterRow, RenameChapterPatch } from './chapterTree'
import { useChapterTree, type ChapterTree, type CreateChapterInput } from './useChapterTree'

/** 章节域装配态（供 `Writer.tsx` 透传左 / 中栏）。 */
export interface ChapterWorkspace {
  /** 未删除章（后端顺序：按卷分组、组内 pin 段序）。 */
  chapters: ChapterRow[]
  /** 改章节状态（两态），成功后就地更新 `chapters`。 */
  setStatus: ChapterTree['setStatus']
  /** 中栏是否切换到回收站视图。 */
  trashOpen: boolean
  /** 当前有效选中章 id（显式选中仍在列表中则用之，否则回退默认章）。 */
  activeChapterId: number | null
  /** 选中章节行（null = 无章）。 */
  activeChapter: ChapterRow | null
  /** 该卷普通章数是否已达上限（容量口径只数普通章）。 */
  isVolumeFull: (volumeId: number) => boolean
  /** 选中章节：退回编辑器视图（若当前在回收站）。 */
  handleSelectChapter: (id: number) => void
  /** 新建章（v2：`volumeId` 必填），创建成功后选中新章并退回编辑器视图。 */
  handleCreateChapter: (input: CreateChapterInput) => void
  /** 软删除章。 */
  handleDeleteChapter: (id: number) => void
  /** 特殊章置顶 / 置底切换。 */
  handleSetChapterPin: (id: number, pin: ChapterPin) => void
  /** 章节拖拽重排（同卷同 pin 段内）。 */
  handleReorderChapter: (id: number, targetIndex: number) => void
  /** 跨卷拖拽移动（追加到目标卷末尾）。 */
  handleMoveChapter: (id: number, volumeId: number) => void
  /** 标题栏「回收站」：切换中栏视图。 */
  handleToggleTrash: () => void
  /** 编辑头章节名落库（字段直映射）。 */
  handleRenameChapter: (id: number, patch: RenameChapterPatch) => void
  /**
   * 回收站还原 / 彻底删除 / 清空后：刷新章节树。
   * 页面层可传 `onTrashChanged` 追加刷新共用数据（共享卷池 / 挂卷大纲行）。
   */
  handleTrashChanged: () => void
  /** 正文替换（单条 / 全部）后：刷新章节树。 */
  handleContentChanged: () => void
}

/**
 * 章节域装配：章节树接库（仅章，卷读写已剥离至共享卷源）+ 选中 / 回收站态 +
 * 章节动作（左栏 hover / 标题栏按钮组 / 回收站共享）。
 *
 * `onTrashChanged` 为页面层附加刷新入口（回收站还原 / 物理删除同时影响共享卷池与挂卷大纲行）。
 */
export function useChapterWorkspace(bookId: string, onTrashChanged?: () => void): ChapterWorkspace {
  // 章节树接库：仅章（卷读写已剥离至共享卷源）+ 状态切换（两态）+ 增删改 / pin / 重排（v2）。
  const {
    chapters,
    setStatus,
    reload,
    renameChapter,
    createChapter,
    deleteChapter,
    setChapterPin,
    reorderChapter,
    moveChapter
  } = useChapterTree(bookId)
  // 用户显式选中的章节 id（null = 尚未选择）。
  const [selectedChapterId, setSelectedChapterId] = useState<number | null>(null)
  // 中栏是否切换到回收站视图。
  const [trashOpen, setTrashOpen] = useState(false)

  // 默认选中章节：首个普通章（否则首个章）。派生而非 effect，避免 setState-in-effect；
  // 若已选章节被删除（不在列表中）同样回退默认，保证选中始终有效。
  const defaultChapterId = useMemo(() => {
    const normal = chapters.find((row) => row.kind === 'normal')
    return normal?.id ?? chapters[0]?.id ?? null
  }, [chapters])
  const activeChapterId = useMemo(() => {
    if (selectedChapterId !== null && chapters.some((row) => row.id === selectedChapterId)) {
      return selectedChapterId
    }
    return defaultChapterId
  }, [selectedChapterId, chapters, defaultChapterId])

  // 选中章节行 + 章节序号 N/M（仅普通卷的普通章；特殊项 index 为 null）。
  const activeChapter = useMemo(
    () => chapters.find((row) => row.id === activeChapterId) ?? null,
    [chapters, activeChapterId]
  )

  // 各卷普通章数（容量口径：只数普通章，与后端 `assertChapterCapacity` 一致）。
  const isVolumeFull = useCallback(
    (volumeId: number): boolean => {
      const count = chapters.filter(
        (row) => row.volumeId === volumeId && row.kind === 'normal'
      ).length
      return count >= MAX_CHAPTERS_PER_VOLUME
    },
    [chapters]
  )

  /* ---------- 章节页动作（左栏 hover / 标题栏按钮组 / 回收站共享） ---------- */

  // 选中章节：退回编辑器视图（若当前在回收站）。
  const handleSelectChapter = useCallback((id: number): void => {
    setSelectedChapterId(id)
    setTrashOpen(false)
  }, [])

  // 新建章（v2：volumeId 必填；普通章自动「第X章」/ 特殊章带前段 + 名）：
  // 创建成功后选中新章并退回编辑器视图。
  const handleCreateChapter = useCallback(
    (input: CreateChapterInput): void => {
      void (async () => {
        const created = await createChapter(input)
        if (created) {
          setSelectedChapterId(created.id)
          setTrashOpen(false)
        }
      })()
    },
    [createChapter]
  )

  const handleDeleteChapter = useCallback(
    (id: number): void => {
      void deleteChapter(id)
    },
    [deleteChapter]
  )

  // 特殊章置顶 / 置底切换。
  const handleSetChapterPin = useCallback(
    (id: number, pin: ChapterPin): void => {
      void setChapterPin(id, pin)
    },
    [setChapterPin]
  )

  // 章节拖拽重排（同卷同 pin 段内）：成功 hook 内 reload；失败返回 false（视觉由 reload 前的
  // 占位线清理自然回滚，无临时视觉残留）。
  const handleReorderChapter = useCallback(
    (id: number, targetIndex: number): void => {
      void reorderChapter(id, targetIndex)
    },
    [reorderChapter]
  )

  // 跨卷拖拽移动：成功 hook 内 reload；失败数据未变，无需额外回滚。
  const handleMoveChapter = useCallback(
    (id: number, volumeId: number): void => {
      void moveChapter(id, volumeId)
    },
    [moveChapter]
  )

  // 标题栏「回收站」：切换中栏视图。
  const handleToggleTrash = useCallback((): void => {
    setTrashOpen((prev) => !prev)
  }, [])

  // 编辑头章节名落库（字段直映射）：就地更新选中行，无需整树重载。
  const handleRenameChapter = useCallback(
    (id: number, patch: RenameChapterPatch): void => {
      void renameChapter(id, patch)
    },
    [renameChapter]
  )

  // 回收站还原 / 彻底删除 / 清空后：刷新章节树，并执行页面层附加刷新
  // （卷行还原 / 物理删除会同时影响两侧卷列表与挂卷大纲行）。
  const handleTrashChanged = useCallback((): void => {
    void reload()
    onTrashChanged?.()
  }, [reload, onTrashChanged])

  // 正文替换（单条 / 全部）后：刷新章节树（章名 / 排序等元信息随后端更新）。
  const handleContentChanged = useCallback((): void => {
    void reload()
  }, [reload])

  return {
    chapters,
    setStatus,
    trashOpen,
    activeChapterId,
    activeChapter,
    isVolumeFull,
    handleSelectChapter,
    handleCreateChapter,
    handleDeleteChapter,
    handleSetChapterPin,
    handleReorderChapter,
    handleMoveChapter,
    handleToggleTrash,
    handleRenameChapter,
    handleTrashChanged,
    handleContentChanged
  }
}
