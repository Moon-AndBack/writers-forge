import { useCallback } from 'react'
import type { CleanWordCategory } from '../../../../../preload/types/cleanWords'
import {
  addCleanWord,
  type CleanWordAddOutcome
} from '../../../components/dialogs/cleanWordActions'
import type { ChapterSearchController } from './useChapterSearch'

/** 交给 `SelectionContextMenu` 的章节侧回调（页面只做装配，不含交互逻辑）。 */
export interface ChapterSelectionMenuProps {
  /** 用选中文字打开查找浮窗（强制「本章」范围）。 */
  onSearchText: (text: string) => void
  /** 把选中文字加入违禁词库（分类由菜单二级选择决定）。 */
  onAddCleanWord: (word: string, category: CleanWordCategory) => Promise<CleanWordAddOutcome>
}

/**
 * 章节正文右键「选区菜单」的动作装配（§9：与大纲共用同一个菜单组件，差异只在回调）。
 *
 * - **搜索**：预填查询词 + **强制 `scope = 'chapter'`**（右键只关心当前章；若上次停在
 *   「全书」，直接沿用会让结果跳到别的章，与「搜索选中文字」的语境不符），再打开浮窗。
 *   浮窗 `open` 由 false → true 时自行聚焦输入框，故无需暴露 focus 入口。
 * - **违禁词**：入库动作与词库弹窗共用 `addCleanWord`（`import` + 词表缓存失效），
 *   校验（非空 / 无换行 / 2–100 字）在菜单内完成，此处只落库。
 *
 * 抽成 hook 而非塞进 `ChaptersView`：该文件已接近 500 行硬上限（§3）。
 */
export function useChapterSelectionMenu(
  search: ChapterSearchController,
  setSearchOpen: (open: boolean) => void
): ChapterSelectionMenuProps {
  const openSearchWith = useCallback(
    (text: string): void => {
      search.setQuery(text)
      search.setScope('chapter')
      setSearchOpen(true)
    },
    [search, setSearchOpen]
  )

  // `addCleanWord` 是模块级函数（引用恒定），可直接作为菜单回调。
  return { onSearchText: openSearchWith, onAddCleanWord: addCleanWord }
}
