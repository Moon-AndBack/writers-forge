import type { DossierDetail as DossierDetailData, DossierUpdatePatch } from './dossierTree'
import { keyValueInputs, keyValuesEqual, toKeyValueRows, type KeyValueRow } from './keyValueRows'

/**
 * 设定档案右栏「子类字段」草稿：品阶 / 档位（原文）+ 三组专属字段 + 自定义键值行。
 * 与 `DossierDetail`（条目详情）分离，改字段只改草稿，点保存才落库。
 */
export interface DossierSubtypeValues {
  /** 物品品阶（等级显示标签）。 */
  grade: string
  /** 档位**原文**（`type="number"` 允许中途为空，落库时再解析为整数）。 */
  rankText: string
  /** 境界体系类型（`world_power_system.kind`；仅境界体系有值）。 */
  powerKind: string
  worldviewFields: Record<string, string>
  itemFields: Record<string, string>
  factionFields: Record<string, string>
  /** 自定义子类键值行（可含尚未填写的空键行）。 */
  customFields: KeyValueRow[]
}

/** 右栏全部可编辑内容的草稿（正文 + 子类字段）。 */
export interface DossierDraft extends DossierSubtypeValues {
  /** 正文纯文本摘要（`world_texts.body`）。 */
  body: string
  /** 正文整条块级 JSON 真源（`world_texts.body_json`，`''` = 空正文）。 */
  bodyJson: string
}

/** 取详情的子类字段原值（品阶 / 档位 / 体系类型 / 三组专属字段 / 自定义键值）建草稿片段。 */
export function createSubtypeValues(detail: DossierDetailData): DossierSubtypeValues {
  return {
    grade: detail.grade,
    rankText: String(detail.rank),
    powerKind: detail.powerKind,
    worldviewFields: { ...detail.worldviewFields },
    itemFields: { ...detail.itemFields },
    factionFields: { ...detail.factionFields },
    customFields: toKeyValueRows(detail.customFields)
  }
}

/** 取详情原值建完整草稿（挂载一次；切条目由外层按 `detail.id` 重建组件）。 */
export function createDossierDraft(detail: DossierDetailData): DossierDraft {
  return {
    ...createSubtypeValues(detail),
    body: detail.body,
    bodyJson: detail.bodyJson
  }
}

/** 档位原文 → 非负整数（非法 / 空白归 0，与旧失焦提交口径一致）。 */
export function parseRank(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const value = Number(trimmed)
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0 ? value : 0
}

/** 两组字典字段是否逐键相等（键集 + 值）。 */
function sameFields(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

/**
 * 草稿 → **仅变更字段**补丁（空对象 = 无改动）。
 *
 * 正文以 `bodyJson` 为真源比对，但 `body` 同时参与比对：老数据 `body_json = ''`
 * 而 `body` 有纯文本兜底时，清空正文必须能识别为改动（否则摘要列残留旧文本）。
 * 变更时**两列成对提交**（与数据层 / 剧情正文同口径）。
 */
export function buildDossierPatch(
  detail: DossierDetailData,
  draft: DossierDraft
): DossierUpdatePatch {
  const patch: DossierUpdatePatch = {}

  if (draft.body !== detail.body || draft.bodyJson !== detail.bodyJson) {
    patch.body = draft.body
    patch.bodyJson = draft.bodyJson
  }
  if (draft.grade !== detail.grade) patch.grade = draft.grade
  const rank = parseRank(draft.rankText)
  if (rank !== detail.rank) patch.rank = rank
  if (draft.powerKind !== detail.powerKind) patch.powerKind = draft.powerKind
  if (!sameFields(draft.worldviewFields, detail.worldviewFields)) {
    patch.worldviewFields = { ...draft.worldviewFields }
  }
  if (!sameFields(draft.itemFields, detail.itemFields)) {
    patch.itemFields = { ...draft.itemFields }
  }
  if (!sameFields(draft.factionFields, detail.factionFields)) {
    patch.factionFields = { ...draft.factionFields }
  }
  const customFields = keyValueInputs(draft.customFields)
  if (!keyValuesEqual(customFields, detail.customFields)) {
    patch.customFields = customFields
  }

  return patch
}
