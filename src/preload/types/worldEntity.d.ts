/**
 * preload 类型域 · **统一设定库**（`worldEntity` 通道）。
 *
 * 属 `src/preload/types/` 按域拆分产物。**单一真源**：经 `import type` 从主进程数据层
 * 取用，不逐字镜像（理由见 `database.d.ts` 文件头）。
 *
 * 第 6 批起境界体系只保留「体系」一张表：渠道 / 层级 / 晋升边 / 角色境界类型已下线。
 */

import type {
  BookRefRow,
  CharacterAgeAnchor,
  CreateWorldEntityInput as MainCreateWorldEntityInput,
  UpdateWorldEntityPatch as MainUpdateWorldEntityPatch,
  UpdateWorldPowerSystemPatch,
  UpdateWorldRefPatch,
  WorldAliasRow,
  WorldCustomField,
  WorldCustomFieldInput,
  WorldEntityDetail,
  WorldEntityRow,
  WorldEntityType,
  WorldPowerSystemRow,
  WorldRefInput,
  WorldRefRow,
  WorldSemanticCodeRow,
  WorldTagRow,
  WorldTextContent
} from '../../main/database/worldEntities'

/**
 * 批 L1：`kind` 已废弃（第 4 批起子类真源为 `subtypeId`），对渲染层**隐藏**该入参。
 *
 * 数据层类型仍保留 `kind?: string` 以兼容既有种子（`worldEntitySeed.ts` 直连数据层），
 * 此处仅从 preload 暴露面剔除，避免渲染层继续依赖废弃字段。
 */
export type CreateWorldEntityInput = Omit<MainCreateWorldEntityInput, 'kind'>
export type UpdateWorldEntityPatch = Omit<MainUpdateWorldEntityPatch, 'kind'>

export type {
  BookRefRow,
  CharacterAgeAnchor,
  WorldEntityType,
  WorldEntityRow,
  WorldEntityDetail,
  WorldCustomField,
  WorldCustomFieldInput,
  WorldAliasRow,
  WorldTagRow,
  WorldTextContent,
  WorldRefRow,
  WorldRefInput,
  UpdateWorldRefPatch,
  WorldSemanticCodeRow,
  WorldPowerSystemRow,
  UpdateWorldPowerSystemPatch
}
