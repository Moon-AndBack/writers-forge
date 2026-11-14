/**
 * preload 类型域 · **分类**（主进程 `database/categories`）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 原 611 行，超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从主进程数据层取用，不逐字镜像
 * （理由见 `database.d.ts` 文件头——`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * 自定义分类的写入口已移除；本域只保留只读树的行类型。
 *
 * `CategoryRow.name` 为**中文原文**（不译项，不进 i18n，见 AGENTS §10）/ §7.5。
 */

import type { CategoryChannel, CategoryRow } from '../../main/database/categories'

export type { CategoryChannel, CategoryRow }
