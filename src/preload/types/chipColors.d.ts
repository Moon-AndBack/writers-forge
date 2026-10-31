/**
 * preload 类型域 · **胶囊配色**（主进程 `database/chipColors`）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 原 611 行，超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从主进程数据层取用，不逐字镜像
 * （理由见 `database.d.ts` 文件头——`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * 色值为设计常量（`bg` / `fg` 为 `#rrggbb` 实色对），不进 i18n。
 */

import type { ChipColorRow } from '../../main/database/chipColors'

export type { ChipColorRow }
