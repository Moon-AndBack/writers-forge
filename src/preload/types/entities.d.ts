/**
 * preload 类型域 · **书籍 / 统计 / 实体**（主进程 `books` / `stats` / `entities` / `entityMatcher`）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 原 611 行，超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从主进程数据层取用，不逐字镜像（理由见 `database.d.ts` 文件头）。
 */

import type { BookRow, CreateBookInput, UpdateBookPatch } from '../../main/database/books'
import type { BookStats } from '../../main/database/stats'
import type {
  CreateEntityInput,
  EntityDetail,
  EntityRow,
  UpdateEntityPatch
} from '../../main/database/entities'
import type { EntityMatch } from '../../main/match/entityMatcher'

export type {
  BookRow,
  CreateBookInput,
  UpdateBookPatch,
  BookStats,
  EntityRow,
  EntityDetail,
  CreateEntityInput,
  UpdateEntityPatch,
  EntityMatch
}
