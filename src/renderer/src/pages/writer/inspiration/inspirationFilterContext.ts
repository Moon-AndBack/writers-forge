/**
 * 灵感筛选条件（活动栏模块浮层 ↔ 中栏卡片网格共享）。
 *
 * 与设定档案 `dossierFilterContext` 同范式：入口在活动栏（`shell/activityBar.tsx`），
 * 消费方在中栏（`pages/writer/inspiration/InspirationView.tsx`）与装配 hook，两者
 * 分属 shell 与 pages 两棵子树，故把条件挂在外壳层（`App.tsx`）共享。
 *
 * 口径：
 * - **分类 = 标签**：`tag` 为精确匹配的标签，`null` 表示全部；
 * - `query` 为关键词，匹配标题 / 内容 / 标签（见 `filterInspirationMatch.ts`）；
 * - 条件按书打标（由 `InspirationFilterProvider` 维护），换书后旧条件自然失效；
 * - 浮层收起不清空条件，网格继续按既有条件过滤。
 */
import { createContext, useContext } from 'react'

/** 灵感筛选条件。 */
export interface InspirationFilterEntry {
  /** 标签筛选值（`null` = 全部）。 */
  tag: string | null
  /** 关键词（匹配标题 + 内容 + 标签）。 */
  query: string
}

/** 空条件（只读共享：任何写入都经 `setFilter` / `clearAll` 生成新对象，不原地修改）。 */
export const EMPTY_INSPIRATION_FILTER: InspirationFilterEntry = { tag: null, query: '' }

/** 稳定空标签数组（未加载 / 换书时复用，避免每次渲染新建引用）。 */
export const EMPTY_INSPIRATION_TAGS: string[] = []

export interface InspirationFilterContextValue {
  /** 当前路由书 id（空串 = 非写作页 / 未解析到）。 */
  bookId: string
  /** 当前书的筛选条件（引用稳定：仅写入时换成新对象）。 */
  filters: InspirationFilterEntry
  /** 合并式更新条件（未提供的字段保持不变）。 */
  setFilter: (patch: Partial<InspirationFilterEntry>) => void
  /** 清空全部条件（标签回到「全部」、关键词清空）。 */
  clearAll: () => void
  /** 全书已使用标签（不含内置预置；排序沿用 `inspiration.tags`）。 */
  tags: string[]
  /** 重新拉取全书标签集合（写操作后由装配 hook 调用）。 */
  refreshTags: () => Promise<void>
}

export const InspirationFilterContext = createContext<InspirationFilterContextValue | null>(null)

/**
 * 读取灵感筛选条件。无 Provider（独立渲染 / 书架页）时回退为空条件，
 * 保证调用方不因缺省上下文崩溃（口径同 `useDossierFilters`）。
 */
export function useInspirationFilters(): InspirationFilterContextValue {
  const context = useContext(InspirationFilterContext)
  if (context === null) {
    return {
      bookId: '',
      filters: EMPTY_INSPIRATION_FILTER,
      setFilter: () => undefined,
      clearAll: () => undefined,
      tags: EMPTY_INSPIRATION_TAGS,
      refreshTags: async () => undefined
    }
  }
  return context
}
