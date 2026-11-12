/**
 * 「新增关系」表单状态与派生逻辑（自 `RelationEditor` 上提，第 8 批）。
 *
 * 为什么上提到弹窗层：添加按钮移到 `Modal` 的 footer 右侧后，footer 与表单不再处于
 * 同一组件子树，需要共享「目标 / 类型是否选完」与 `addRelation` 动作。这里把状态与
 * 联动逻辑收敛为一个受控 hook，由 `DossierRelationsDialog` 调用，再以 `draft` 对象
 * 传给 `RelationEditor` 渲染——避免 `useImperativeHandle` 的命令式 ref，也避免在两处
 * 重复实现 `canAdd` / 候选过滤。
 *
 * 联动规则保持不变：模块 → 类别 → 项目三级联动（改上级清空下级）；模块变更时把关系
 * 类型切到「当前实体 + 目标模块」组合首项；角色 → 物品自动反向（写库恒记「物品属于角色」）。
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RelationDirection, RelationTypeOption } from './RelationList'
import { MODULE_ENTITY_TYPE, isReverseRelation, relationCodesForPair } from './dossierTree'
import type {
  DossierRelationInput,
  RelationTargetModule,
  WorldEntityType,
  WorldRefRow,
  WorldSemanticCodeRow
} from './dossierTree'
import { entityChipClass } from './relationChip'
import { useRelationLabels } from './useRelationLabels'
import { useRelationTargets } from './useRelationTargets'
import { useRelationCategories } from './useRelationCategories'

/** 类别下拉的哨兵值：「全部类别」/「未分类」与「尚未选择」（空串）解耦。 */
const CATEGORY_ALL = '__all__'
const CATEGORY_UNCATEGORIZED = '__uncategorized__'

export interface RelationDraftOptions {
  /** 当前实体 id（新增关系时作源端）。 */
  entityId: number
  /** 当前实体类型（参与关系类型过滤与反向判定）。 */
  entityType: WorldEntityType
  /** 当前书籍 id（拉取本书全部实体作为跨模块候选）。 */
  bookId: string
  /** 出边关系（用于排除已关联目标）。 */
  relations: WorldRefRow[]
  /** 入边关系（角色 → 物品反向写时一并排除）。 */
  incoming: WorldRefRow[]
  /** 语义码字典（全局）。 */
  semanticCodes: WorldSemanticCodeRow[]
  /** 新增关系（由弹窗层绑定到 `useDossierRelations().add`）。 */
  onAdd: (input: DossierRelationInput) => void
}

export interface RelationDraftState {
  /** 目标模块（空串 = 未选）。 */
  targetModule: RelationTargetModule | ''
  /** 类别（空串 = 未选；含「全部」/「未分类」哨兵）。 */
  targetCategory: string
  /** 具体项目 id（字符串，空串 = 未选）。 */
  targetId: string
  /** 关系类型（语义码）。 */
  typeCode: string
  /** 备注草稿。 */
  note: string
  /** 改模块：类别默认「全部」、清空项目，并把类型切到新组合首项。 */
  setTargetModule: (next: RelationTargetModule | '') => void
  /** 改类别：清空已选项目。 */
  setTargetCategory: (next: string) => void
  setTargetId: (next: string) => void
  setTypeCode: (next: string) => void
  setNote: (next: string) => void
  /** 角色 → 物品：写库自动反向。 */
  reverse: boolean
  /** 目标模块已选（关系类型下拉可用）。 */
  typeSelectable: boolean
  /** 目标与类型均已选完，可提交。 */
  canAdd: boolean
  /** 提交新增，并清空项目 / 备注、类型回落到组合首项。 */
  addRelation: () => void
  /** 类别下拉选项（本书分类表中本模块的分类 + 全部 + 未分类）。 */
  categoryOptions: RelationTypeOption[]
  /** 具体项目组合框选项。 */
  targetOptions: RelationTypeOption[]
  /** 新增关系的类型候选（组合首项为默认值）。 */
  typeOptions: RelationTypeOption[]
  /** 目标候选加载中（组合框空态文案）。 */
  targetsLoading: boolean
  /** 既有关系行的类型候选（按方向 + 对端类型过滤，并保留历史码）。 */
  optionsFor: (rel: WorldRefRow, direction: RelationDirection) => RelationTypeOption[]
  /**
   * 既有关系胶囊的配色类名（`chip-m-*` / `chip-p-*`，与语义色变体类并存）。
   * 候选尚未就绪时返回空串，由胶囊按默认模块色兜底。
   */
  pillColorClass: (rel: WorldRefRow, direction: RelationDirection) => string
}

export function useRelationDraft({
  entityId,
  entityType,
  bookId,
  relations,
  incoming,
  semanticCodes,
  onAdd
}: RelationDraftOptions): RelationDraftState {
  const { t } = useTranslation('dossier')
  // 关系类型名（i18n 真源，`dossier` ns）：下拉选项优先取它，DB 的 note 仅作未知码兜底。
  const { typeName } = useRelationLabels()
  const [targetModule, setTargetModuleState] = useState<RelationTargetModule | ''>('')
  const [targetCategory, setTargetCategoryState] = useState('')
  const [targetId, setTargetId] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [note, setNote] = useState('')

  const displayName = (name: string): string => (name.trim() === '' ? t('unnamed') : name)

  // 跨模块候选（本书全部实体，角色也可作目标）。
  const { targets, loading: targetsLoading } = useRelationTargets(bookId)
  // 本书分类表（类别下拉真源）：角色模块即使尚无某类实体，也列出四条预设分类。
  const subtypes = useRelationCategories(bookId)

  /** 目标模块对应的实体类型（未选模块为 null）。 */
  const targetType = targetModule === '' ? null : MODULE_ENTITY_TYPE[targetModule]
  /** 角色 → 物品：写库时自动反向（恒记「物品属于角色」）。 */
  const reverse = isReverseRelation(entityType, targetType)

  /**
   * 已关联目标：出边目标恒排除；角色 → 物品反向写（物品 → 角色），已指向当前角色的
   * 物品落在入边，同样排除以免重复建边。
   */
  const relatedIds = new Set(relations.map((rel) => rel.toId))
  if (reverse) {
    for (const rel of incoming) {
      if (targets.find((row) => row.id === rel.fromId)?.entityType === 'item') {
        relatedIds.add(rel.fromId)
      }
    }
  }
  const candidates = targets.filter((row) => row.id !== entityId && !relatedIds.has(row.id))
  /** 当前「当前实体 + 目标模块」组合的可选关系码（未选模块时为全部四码）。 */
  const relationCodes = relationCodesForPair(entityType, targetType)

  const allOptions = semanticCodes.map((code) => {
    const note = code.note.trim()
    // 类型名以 i18n 为准；DB 备注仅作未知码（自定义 / 历史残留）兜底。
    return { value: code.code, label: typeName(code.code) || (note !== '' ? note : code.code) }
  })
  /** 按码取选项：字典缺项时回退 i18n 类型名，避免下拉出现裸码。 */
  const optionFor = (code: string): RelationTypeOption =>
    allOptions.find((option) => option.value === code) ?? {
      value: code,
      label: typeName(code) || code
    }
  /** 新增关系的类型候选（顺序即规则表顺序，首项为默认值）。 */
  const typeOptions = relationCodes.map(optionFor)
  /** 组合默认类型：目标模块变更 / 连续添加后回落到首项。 */
  const defaultTypeCode = typeOptions[0]?.value ?? ''

  /**
   * 编辑既有关系时的类型候选：按「该行两端模块」过滤，并保留该行自身的码
   * （历史组合 / 字典缺项）。
   *
   * 端点在方向间对调：出边 `from = 当前实体`、`to = 对端`；入边 `from = 对端`、
   * `to = 当前实体`。对端类型查不到时回退「未选目标」的宽松候选（全部四码）。
   * 选项文案统一取类型名（`typeName`），方向说明由列表内的 `incomingTypeHint` 承担，
   * 不再拼接「正向 · 反向」双读法。
   */
  const optionsFor = (rel: WorldRefRow, direction: RelationDirection): RelationTypeOption[] => {
    const peerId = direction === 'out' ? rel.toId : rel.fromId
    const peerType = targets.find((row) => row.id === peerId)?.entityType ?? null
    const codes =
      direction === 'out'
        ? relationCodesForPair(entityType, peerType)
        : peerType === null
          ? relationCodesForPair(entityType, null)
          : relationCodesForPair(peerType, entityType)
    const options = codes.map(optionFor)
    if (rel.semanticCode === null || options.some((option) => option.value === rel.semanticCode)) {
      return options
    }
    return [optionFor(rel.semanticCode), ...options]
  }

  /**
   * 既有关系胶囊的配色类名：按方向取对端 id（出边 `to`、入边 `from`），再以候选表
   * 反查对端实体类型与预设分类，算出 `chip-m-<type>` + `chip-p-<presetKey>`。
   *
   * 兜底：候选表尚未加载完（对端查不到）时返回空串，胶囊不挂模块类，
   * 由 `chip-pill-tokens.css` 的 `:root` 默认模块色兜底；语义色变体类始终保留。
   */
  const pillColorClass = (rel: WorldRefRow, direction: RelationDirection): string => {
    const peerId = direction === 'out' ? rel.toId : rel.fromId
    const peer = targets.find((row) => row.id === peerId)
    if (peer === undefined) return ''
    return entityChipClass(peer.entityType, peer.presetKey)
  }

  const moduleCandidates =
    targetType === null ? [] : candidates.filter((row) => row.entityType === targetType)

  // 类别候选：分类表中本模块的全部分类（预设 / 自定义，按 sort_order, id 顺序）
  // + 候选实体里出现但分类表已无的类别名（历史软删兜底）+「全部」+「未分类」。
  const moduleSubtypes =
    targetType === null ? [] : subtypes.filter((row) => row.entityType === targetType)
  const categoryNames: string[] = moduleSubtypes.map((row) => row.name)
  let hasUncategorized = false
  for (const row of moduleCandidates) {
    if (row.subType === '') {
      hasUncategorized = true
    } else if (!categoryNames.includes(row.subType)) {
      categoryNames.push(row.subType)
    }
  }
  const categoryOptions: RelationTypeOption[] = [
    { value: CATEGORY_ALL, label: t('detail.relation.categoryAll') },
    ...categoryNames.map((name) => ({ value: name, label: name })),
    ...(hasUncategorized
      ? [{ value: CATEGORY_UNCATEGORIZED, label: t('subTypeUncategorized') }]
      : [])
  ]

  const categoryCandidates =
    targetCategory === CATEGORY_ALL
      ? moduleCandidates
      : targetCategory === CATEGORY_UNCATEGORIZED
        ? moduleCandidates.filter((row) => row.subType === '')
        : moduleCandidates.filter((row) => row.subType === targetCategory)

  // 「全部」视图下同名条目可能分属不同类别，标签补类别名以便区分。
  const targetOptions: RelationTypeOption[] = categoryCandidates.map((row) => ({
    value: String(row.id),
    label:
      targetCategory === CATEGORY_ALL && row.subType !== ''
        ? `${displayName(row.name)} · ${row.subType}`
        : displayName(row.name)
  }))

  // 目标可能因关系刷新（已建边）从候选中消失：只有仍在当前候选内才允许添加。
  const targetValid = categoryCandidates.some((row) => String(row.id) === targetId)
  const canAdd = targetValid && typeCode !== ''

  /**
   * 切模块后类别默认「全部」：项目组合框直接列出该模块全部实体，用户可再收窄到
   * 具体分类；清空模块（`''`）时类别也必须回到空串，否则 `disabled` 状态下会残留
   * 「全部」。
   */
  const setTargetModule = (next: RelationTargetModule | ''): void => {
    setTargetModuleState(next)
    setTargetCategoryState(next === '' ? '' : CATEGORY_ALL)
    setTargetId('')
    // 组合变更即重选类型：切到新组合首项（如角色 → 物品自动落到「属于」）。
    setTypeCode(
      relationCodesForPair(entityType, next === '' ? null : MODULE_ENTITY_TYPE[next])[0] ?? ''
    )
  }

  const setTargetCategory = (next: string): void => {
    setTargetCategoryState(next)
    setTargetId('')
  }

  const addRelation = (): void => {
    if (!canAdd) return
    onAdd({
      targetId: Number(targetId),
      semanticCode: typeCode,
      note: note.trim(),
      ...(reverse ? { reverse: true } : {})
    })
    // 模块 / 类别保留，便于连续添加同类目标；类型回落到当前组合首项。
    setTargetId('')
    setTypeCode(defaultTypeCode)
    setNote('')
  }

  return {
    targetModule,
    targetCategory,
    targetId,
    typeCode,
    note,
    setTargetModule,
    setTargetCategory,
    setTargetId,
    setTypeCode,
    setNote,
    reverse,
    typeSelectable: targetType !== null,
    canAdd,
    addRelation,
    categoryOptions,
    targetOptions,
    typeOptions,
    targetsLoading,
    optionsFor,
    pillColorClass
  }
}
