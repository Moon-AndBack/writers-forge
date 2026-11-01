/**
 * 设定档案筛选条件（活动栏模块浮层 ↔ 中栏卡片网格共享）。
 *
 * 为什么放在独立 Context：筛选入口在**活动栏**（`shell/activityBar.tsx`），消费方是
 * **中栏**（`pages/writer/dossier/DossierView.tsx`），两者分属 shell 与 pages 两棵子树；
 * Context 挂在外壳层（`App.tsx`）即可跨层共享，无需把状态塞进页面或反向 import。
 *
 * 口径：
 * - 条件**按模块分桶**（五域各自独立），切模块不互相覆盖；
 * - 浮层收起不清空条件（与「显隐」解耦），网格继续按既有条件过滤；
 * - `bookId` 为路由书 id 的**唯一真源**（由 `DossierFilterProvider` 从 pathname 解析），
 *   供浮层拉取子类选项；页面侧数据仍走各自装配包。
 * - 浮层里的「匹配 N 项」不在浮层重算过滤：中栏（`DossierView`）把 `filterDossierRows`
 *   的入参 / 出参长度作为**只读汇总**上报（`summary`），保证浮层计数与网格同一口径。
 */
import { createContext, useContext } from 'react'
import type { DossierModule } from '../../../shell/activityBarModules'

/** 子类筛选取值：全部（不过滤子类）。 */
export const FILTER_ALL = 'all'

/** 单模块筛选条件。 */
export interface DossierFilterEntry {
  /** 子类筛选值（`FILTER_ALL` 或分类 id 字符串）。 */
  subtype: string
  /** 关键词（匹配名称 + 别名）。 */
  query: string
}

/** 五域筛选条件（按模块分桶）。 */
export type DossierFilters = Record<DossierModule, DossierFilterEntry>

/** 单模块匹配汇总（由中栏 `DossierView` 按同一过滤口径上报，供浮层展示计数）。 */
export interface DossierFilterSummary {
  /** 该模块全部条目数（未过滤前）。 */
  total: number
  /** 当前子类 + 关键词条件下可见的条目数。 */
  matched: number
}

/** 五域匹配汇总：只记录已上报过的模块（未访问 / 未加载的模块没有条目）。 */
export type DossierFilterSummaries = Partial<Record<DossierModule, DossierFilterSummary>>

/** 空汇总（只读共享：写入经 `setSummary` 生成新对象，不原地修改）。 */
export const EMPTY_SUMMARIES: DossierFilterSummaries = {}

/** 空条件（只读共享：任何写入都经 `setFilter` 生成新对象，不原地修改）。 */
const EMPTY_ENTRY: DossierFilterEntry = { subtype: FILTER_ALL, query: '' }

/** 默认条件：五域均为「全部 + 空关键词」。 */
export const DEFAULT_FILTERS: DossierFilters = {
  worldview: EMPTY_ENTRY,
  characters: EMPTY_ENTRY,
  factions: EMPTY_ENTRY,
  power_system: EMPTY_ENTRY,
  items: EMPTY_ENTRY
}

export interface DossierFilterContextValue {
  /** 当前路由书 id（空串 = 非写作页 / 未解析到）。 */
  bookId: string
  /** 五域筛选条件（引用稳定：仅被修改的模块换成新对象）。 */
  filters: DossierFilters
  /** 合并式更新某模块的条件（未提供的字段保持不变）。 */
  setFilter: (module: DossierModule, patch: Partial<DossierFilterEntry>) => void
  /** 五域匹配汇总（只读）：中栏按 `filterDossierRows` 口径上报，浮层只读不重算。 */
  summary: DossierFilterSummaries
  /** 上报某模块的匹配汇总（值未变化时 Provider 内直接跳过，避免 effect 自激）。 */
  setSummary: (module: DossierModule, summary: DossierFilterSummary) => void
}

export const DossierFilterContext = createContext<DossierFilterContextValue | null>(null)

/**
 * 读取设定档案筛选条件。无 Provider（独立渲染 / 书架页）时回退为空条件，
 * 保证调用方不因缺省上下文崩溃（口径同 `useActivityBar`）。
 */
export function useDossierFilters(): DossierFilterContextValue {
  const context = useContext(DossierFilterContext)
  if (context === null) {
    return {
      bookId: '',
      filters: DEFAULT_FILTERS,
      setFilter: () => undefined,
      summary: EMPTY_SUMMARIES,
      setSummary: () => undefined
    }
  }
  return context
}
