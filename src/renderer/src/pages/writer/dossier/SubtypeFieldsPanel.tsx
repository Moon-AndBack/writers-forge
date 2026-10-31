import { useTranslation } from 'react-i18next'
import { FormField, Input } from '../../../components/ui'
import CustomKeyValueEditor from './CustomKeyValueEditor'
import type { DossierDetail as DossierDetailData } from './dossierTree'
import {
  FACTION_SUBTYPE_FIELDS,
  ITEM_SUBTYPE_FIELDS,
  WORLDVIEW_SUBTYPE_FIELDS
} from './dossierTree'
import type { DossierSubtypeValues } from './dossierDraft'

export interface SubtypeFieldsPanelProps {
  /** 当前条目详情（只读：子类 / 品阶档位 / 各域字段结构来源）。 */
  detail: DossierDetailData
  /** 当前草稿值（受控）。 */
  values: DossierSubtypeValues
  /** 草稿变更（整体补丁，只回传改动的分组 / 字段）。 */
  onChange: (patch: Partial<DossierSubtypeValues>) => void
  /**
   * 无任何子类字段时是否渲染空态提示（§9：差异用 props 表达）。
   *
   * - 右栏上段（`DossierDetail`）传 `true`：五域右栏恒定两张卡，上卡留一句说明，
   *   避免切换条目时上下卡高度跳动；
   * - 其它场景（如弹窗内嵌）可省略。
   */
  showEmptyHint?: boolean
}

/**
 * 子类专属字段面板（五域通用，§9 通用组件优先）：
 * 只承载**子类表内字段**，不含名称 / 类别 / 别名 / 标签 / 关系 / 正文。
 *
 * - 体系类型：仅境界体系（`world_power_system.kind`，本域唯一专属字段）；
 * - 品阶 / 档位：仅物品预设子类 weapon / skill / pill / talent / equipment；
 * - 预设子类字段：世界观 / 物品功法 / 势力各六类，按 `presetKey` 路由；
 * - 自定义子类（物品 / 势力，`presetKey = ''`）：动态键值行；
 *   世界观自定义子类无专属字段存储，保持不出字段组。
 *
 * **受控**：本面板只把编辑写入草稿（`onChange`），不直接写库；落库由右栏保存按钮
 * 统一提交（批 B 手动保存口径）。字段渲染只有这一份，禁止复制字段 JSX。
 */
export default function SubtypeFieldsPanel({
  detail,
  values,
  onChange,
  showEmptyHint = false
}: SubtypeFieldsPanelProps) {
  const { t } = useTranslation('dossier')
  const entityType = detail.entityType

  // 字段分组按 `presetKey`（`world_subtypes.preset_key`）路由，与主进程白名单键一致；
  // 未分类（`subtypeId = null`）或自定义子类（`presetKey = ''`）时不出预设字段组。
  const worldviewFieldKeys =
    entityType === 'worldview' ? (WORLDVIEW_SUBTYPE_FIELDS[detail.presetKey] ?? []) : []
  const itemFieldKeys = entityType === 'item' ? (ITEM_SUBTYPE_FIELDS[detail.presetKey] ?? []) : []
  const factionFieldKeys =
    entityType === 'faction' ? (FACTION_SUBTYPE_FIELDS[detail.presetKey] ?? []) : []
  // `world_custom` 仅承载 item / faction 的自定义子类（见数据层 `resolveTarget`），
  // 为动态键值行，由 `CustomKeyValueEditor` 编辑（无固定字段白名单）。
  const isCustomSubType =
    (entityType === 'item' || entityType === 'faction') &&
    detail.subtypeId !== null &&
    detail.presetKey === ''

  const gradeId = `entity-field-grade-${detail.id}`
  const rankId = `entity-field-rank-${detail.id}`
  const powerKindId = `entity-field-power-kind-${detail.id}`

  // 境界体系唯一专属字段：体系类型（`world_power_system.kind`，自由文本）。
  const powerKindBlock =
    entityType === 'power_system' ? (
      <div className="dossier-detail__section">
        <FormField label={t('detail.powerKindLabel')} htmlFor={powerKindId}>
          <Input
            id={powerKindId}
            value={values.powerKind}
            placeholder={t('detail.powerKindPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ powerKind: event.target.value })}
          />
        </FormField>
      </div>
    ) : null

  // 品阶 / 档位：仅物品预设子类 weapon/skill/pill/talent/equipment（与主进程白名单同步）。
  const gradeRankBlock =
    entityType === 'item' && detail.presetKey !== '' && detail.presetKey !== 'material' ? (
      <div className="dossier-detail__section dossier-grade-rank">
        <FormField label={t('detail.gradeLabel')} htmlFor={gradeId}>
          <Input
            id={gradeId}
            value={values.grade}
            placeholder={t('detail.gradePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ grade: event.target.value })}
          />
        </FormField>
        <FormField label={t('detail.rankLabel')} htmlFor={rankId}>
          <Input
            id={rankId}
            type="number"
            min={0}
            step={1}
            value={values.rankText}
            placeholder={t('detail.rankPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => onChange({ rankText: event.target.value })}
          />
        </FormField>
      </div>
    ) : null

  const hasFields =
    powerKindBlock !== null ||
    gradeRankBlock !== null ||
    worldviewFieldKeys.length > 0 ||
    itemFieldKeys.length > 0 ||
    factionFieldKeys.length > 0 ||
    isCustomSubType

  // 无字段：右栏留一句空态（恒定两卡）。
  if (!hasFields) {
    return showEmptyHint ? (
      <p className="dossier-detail__empty">{t('detail.noSubtypeFields')}</p>
    ) : null
  }

  return (
    <div className="dossier-subtype-fields">
      {powerKindBlock}
      {gradeRankBlock}

      <SubtypeFieldsGroup
        id={detail.id}
        prefix="wv"
        labelGroup="worldviewFields"
        fieldKeys={worldviewFieldKeys}
        values={values.worldviewFields}
        onChange={(key, next) =>
          onChange({ worldviewFields: { ...values.worldviewFields, [key]: next } })
        }
      />

      <SubtypeFieldsGroup
        id={detail.id}
        prefix="item"
        labelGroup="itemFields"
        fieldKeys={itemFieldKeys}
        values={values.itemFields}
        onChange={(key, next) => onChange({ itemFields: { ...values.itemFields, [key]: next } })}
      />

      <SubtypeFieldsGroup
        id={detail.id}
        prefix="faction"
        labelGroup="factionFields"
        fieldKeys={factionFieldKeys}
        values={values.factionFields}
        onChange={(key, next) =>
          onChange({ factionFields: { ...values.factionFields, [key]: next } })
        }
      />

      {isCustomSubType ? (
        <CustomKeyValueEditor
          ownerId={detail.id}
          rows={values.customFields}
          onChange={(customFields) => onChange({ customFields })}
        />
      ) : null}
    </div>
  )
}

interface SubtypeFieldsGroupProps {
  /** 条目 id（用于生成输入框 id）。 */
  id: number
  /** id 前缀，区分不同字段组。 */
  prefix: string
  /** i18n 中 `detail` 下的字段组 key（预设子类；自定义子类走键值编辑器）。 */
  labelGroup: 'worldviewFields' | 'itemFields' | 'factionFields'
  /** 本组字段 key（空数组时不渲染）。 */
  fieldKeys: readonly string[]
  /** 当前字段值。 */
  values: Record<string, string>
  /** 字段变更（受控，逐键回传）。 */
  onChange: (key: string, value: string) => void
}

/** 子类专属字段组（世界观 / 物品功法 / 势力 / 自定义类型共用）：label + 受控 Input。 */
function SubtypeFieldsGroup({
  id,
  prefix,
  labelGroup,
  fieldKeys,
  values,
  onChange
}: SubtypeFieldsGroupProps) {
  const { t } = useTranslation('dossier')
  if (fieldKeys.length === 0) return null
  return (
    <div className="dossier-detail__section">
      {fieldKeys.map((key) => {
        const fieldId = `entity-field-${prefix}-${id}-${key}`
        return (
          <FormField key={key} label={t(`detail.${labelGroup}.${key}` as never)} htmlFor={fieldId}>
            <Input
              id={fieldId}
              value={values[key] ?? ''}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </FormField>
        )
      })}
    </div>
  )
}
