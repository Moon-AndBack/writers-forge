/**
 * preload 类型域 · **子类分类表**（`worldSubtype` 通道）。
 *
 * 属 `src/preload/types/` 按域拆分产物。**单一真源**：经 `import type` 从主进程数据层
 * 取用，不逐字镜像（理由见 `database.d.ts` 文件头）。
 */

import type {
  CreateWorldSubtypeInput,
  PresetWorldSubtype,
  UpdateWorldSubtypePatch,
  WorldSubtypeRow
} from '../../main/database/worldSubtypes'

export type {
  CreateWorldSubtypeInput,
  PresetWorldSubtype,
  UpdateWorldSubtypePatch,
  WorldSubtypeRow
}
