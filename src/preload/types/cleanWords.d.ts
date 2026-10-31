/**
 * preload 类型域 · **违禁词库**（主进程 `database/cleanWords` + `ipc/cleanWords`）。
 *
 * 属 `src/preload/types/` 按域拆分产物。**单一真源**：领域类型一律经 `import type`
 * 从主进程数据层取用，不逐字镜像（理由见 `database.d.ts` 文件头：`import type`
 * 编译期擦除，不污染 renderer bundle）。
 *
 * 安全约定：`import` **不接受来源参数**——来源在主进程 / preload 两处均固定为
 * `'user'`，内置词库（`builtin`）只能由主进程播种与版本更新写入。
 */

import type {
  ActiveCleanWord,
  CleanWordCategory,
  CleanWordCount,
  CleanWordFilter,
  CleanWordImportInput,
  CleanWordImportResult,
  CleanWordRow,
  CleanWordSource
} from '../../main/database/cleanWords'

export type {
  ActiveCleanWord,
  CleanWordCategory,
  CleanWordCount,
  CleanWordFilter,
  CleanWordImportInput,
  CleanWordImportResult,
  CleanWordRow,
  CleanWordSource
}

/**
 * 违禁词库 preload 暴露面（挂载于 `window.api.cleanWords`）。
 *
 * 通道对应关系见 `main/ipc/cleanWords.ts` 的 `registerCleanWordsIpc` 注释块，两侧须同步。
 */
export interface CleanWordsApi {
  /** 词表浏览（可按来源 / 类别过滤）；入参非法 → 空数组。 */
  list: (filter?: CleanWordFilter) => Promise<CleanWordRow[]>
  /** 各来源 / 类别计数。 */
  count: () => Promise<CleanWordCount[]>
  /** 检测用：只返回启用中的词（`word` / `category` / `replacement`）。 */
  active: () => Promise<ActiveCleanWord[]>
  /** 批量导入用户词条；来源固定 `'user'`，非法或写入失败 → null。 */
  import: (words: CleanWordImportInput[]) => Promise<CleanWordImportResult | null>
  /** 单条启用 / 禁用；未命中记录 → false。 */
  toggle: (id: number, enabled: boolean) => Promise<boolean>
  /** 删除单条（仅 `source='user'`，内置词由数据层拒绝）；未删除 → false。 */
  delete: (id: number) => Promise<boolean>
}
