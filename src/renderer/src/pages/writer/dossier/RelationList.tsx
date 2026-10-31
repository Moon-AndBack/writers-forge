import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Select, Tag } from '../../../components/ui'
import {
  relationSemanticLabel,
  relationSemanticReverseLabel
} from '../../../../../shared/worldRelationCodes'
import ConfirmDialog from '../ConfirmDialog'
import type { DossierRelationPatch, WorldEntityType, WorldRefRow } from './dossierTree'

/** 关系方向：出边（我 → 对方）/ 入边（对方 → 我）。 */
export type RelationDirection = 'out' | 'in'

/** 关系类型下拉选项（与 `Select` 的选项同形）。 */
export interface RelationTypeOption {
  value: string
  label: string
}

/** 关系类型**正向**文案（`semantic_code` 描述 from → to）：字典备注优先，缺则回退码本身。 */
function forwardTypeLabel(rel: WorldRefRow): string {
  return rel.semanticNote.trim() !== '' ? rel.semanticNote : (rel.semanticCode ?? '')
}

/** 语义码 → 胶囊配色变体（四码各一色；空码 / 未知码回退中性）。 */
function pillTone(code: string | null): string {
  switch (code) {
    case 'superior':
      return 'superior'
    case 'subordinate':
      return 'subordinate'
    case 'peer':
      return 'peer'
    case 'belongs_to':
      return 'belonging'
    default:
      return 'neutral'
  }
}

export interface RelationListProps {
  /** 方向（决定对端字段与胶囊的 `belongs_to` 反向收尾）。 */
  direction: RelationDirection
  /**
   * 当前实体类型（仅出边使用）：物品的 `belongs_to` 直接显示目标名，不带「属于」前缀
   * （物品归属关系由角色 / 势力侧表达更自然）；其余模块保持「属于 目标名」。
   */
  entityType?: WorldEntityType
  /** 本方向的关系行（出边 / 入边）。 */
  relations: readonly WorldRefRow[]
  /** 该行可选的类型（调用方按方向 + 对端实体类型过滤，并保留该行历史码）。 */
  optionsFor: (rel: WorldRefRow) => RelationTypeOption[]
  /**
   * 胶囊底色类名（可选）：返回 `chip-m-*`（可选 `chip-p-*` 预设子类独立色），用于胶囊**底色**；
   * 返回空串时不挂底色类，交由全局 `:root` 默认模块色兜底。
   */
  pillClassOf?: (rel: WorldRefRow) => string
  /** 更新关系（类型 / 备注）。 */
  onUpdate: (refId: number, patch: DossierRelationPatch) => void
  /** 删除关系。 */
  onRemove: (refId: number) => void
}

/**
 * 关系胶囊列表（出边与入边**共用同一份渲染 + 就地编辑面板**，§9）。
 *
 * 方向只影响两处（`direction` 参数化，不做平行实现）：
 * - **对端**：出边读 `toName`（我指向谁），入边读 `fromName`（谁指向我）；
 * - **阅读顺序**：出边「类型 对端名」（平级只显示对端名；物品的 `belongs_to` 同样只显示
 *   目标名）；入边同样取**正向**读法「类型 对端名」（如「上级 砚境」「下级 抄书阁」，
 *   平级只显示对端名），唯一例外是 `belongs_to`——正向「属于 对端名」会被误读为
 *   「我属于对方」，故保留反向收尾「对端名 属于我」。卡片摘要（`dossierCardRelations.ts`
 *   的 `relationChipLabel`）采用同一正向读法。
 *
 * 两端可编辑范围一致：胶囊内 ▸/▾ 展开就地改类型 / 备注，× 删除（二次确认，入边删除的
 * 是对方发起的那条 `world_refs` 行）；**关联对象不可改**——端点由发起方决定。
 * 胶囊配色分两层：`dossier-rel-pill--*` 按语义码取主题令牌派生（superior / subordinate /
 * peer / belongs_to 四色，供圆点 / 描边），可选的 `pillClassOf` 追加 `chip-m-*` / `chip-p-*`
 * 作底色（预设子类取独立色，自定义分类回落模块色；未提供时回落 `:root` 默认模块色）；
 * 悬停显示备注（空备注不挂 tip）；
 * 容器 `flex-wrap` 自动换行。
 *
 * 使用方：`RelationEditor` 的出边列表与「被引用」（入边）列表。
 */
export default function RelationList({
  direction,
  entityType,
  relations,
  optionsFor,
  pillClassOf,
  onUpdate,
  onRemove
}: RelationListProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  /** 当前展开编辑的行（同一列表内只展开一行）。 */
  const [editingId, setEditingId] = useState<number | null>(null)
  /** 待确认删除的行（null = 未弹确认）。 */
  const [removing, setRemoving] = useState<WorldRefRow | null>(null)

  const displayName = (name: string): string => (name.trim() === '' ? t('unnamed') : name)

  /** 对端名称：出边取目标，入边取来源。 */
  const peerName = (rel: WorldRefRow): string => (direction === 'out' ? rel.toName : rel.fromName)

  /**
   * 出边前缀：四码取共享层展示名（`worldRelationCodes`）；**平级无前缀**（只显示目标名），
   * 物品的 `belongs_to` 同样无前缀（物品条目的胶囊只看归属对象名，如「砚秋」）；未知 / 空码回退
   * 正向文案（备注优先，再回退「自定义关系」）。
   */
  const outPrefix = (rel: WorldRefRow): string => {
    if (rel.semanticCode === 'peer') return ''
    if (rel.semanticCode === 'belongs_to' && entityType === 'item') return ''
    return (
      relationSemanticLabel(rel.semanticCode ?? '') ||
      forwardTypeLabel(rel) ||
      t('detail.relation.custom')
    )
  }

  /**
   * 入边前缀：与出边同款**正向**读法。语义码仍描述「对方 → 我」，所以
   * `superior`（对方是我的上级）读作「上级 <对端名>」、`subordinate`（对方是我的下级）
   * 读作「下级 <对端名>」；平级 / 未知 / 空码无前缀（只显示对端名）。
   */
  const inPrefix = (rel: WorldRefRow): string => {
    switch (rel.semanticCode) {
      case 'superior':
      case 'subordinate':
        return relationSemanticLabel(rel.semanticCode)
      default:
        return ''
    }
  }

  /**
   * 入边后缀：仅 `belongs_to` 保留反向读法「对端名 属于我」。该码语义为
   * 「对端属于我」，若取正向「属于 <对端名>」会被读成「我属于对方」，与事实相反。
   */
  const inSuffix = (rel: WorldRefRow): string =>
    rel.semanticCode === 'belongs_to' ? relationSemanticReverseLabel('belongs_to') : ''

  /**
   * 胶囊正文：出边与入边都用「类型 对端名」（平级 / 未知码 / 物品的 `belongs_to`
   * 只显示对端名）；入边的 `belongs_to` 例外，读作「对端名 属于我」。
   * 与卡片摘要（`dossierCardRelations.ts` 的 `relationChipLabel`）同一正向读法；物品出边
   * `belongs_to` 免前缀为本弹窗特例。
   */
  const pillText = (rel: WorldRefRow): string => {
    const peer = displayName(peerName(rel))
    if (direction === 'in') {
      const prefix = inPrefix(rel)
      if (prefix !== '') return `${prefix} ${peer}`
      const suffix = inSuffix(rel)
      return suffix === '' ? peer : `${peer} ${suffix}`
    }
    const prefix = outPrefix(rel)
    return prefix === '' ? peer : `${prefix} ${peer}`
  }

  const editingRelation = relations.find((rel) => rel.id === editingId) ?? null

  return (
    <>
      <ul className="dossier-rel-pills">
        {relations.map((rel) => {
          const editing = rel.id === editingId
          const note = rel.note.trim()
          /**
           * 类名分两层：`dossier-rel-pill--*` 提供**语义色**（样式侧据此上圆点 / 描边），
           * 追加的 `chip-m-*` / `chip-p-*` 提供**底色**（预设子类独立色 / 自定义分类模块色；
           * 缺省时回落到 `:root` 默认色）。
           * 过滤空段后再拼接，避免空串造成连续 / 尾随空格。
           */
          const pillClassName = [
            'dossier-rel-pill',
            `dossier-rel-pill--${pillTone(rel.semanticCode)}`,
            pillClassOf?.(rel) ?? '',
            editing ? 'is-editing' : ''
          ]
            .filter((part) => part !== '')
            .join(' ')
          return (
            <li className="dossier-rel-pill-item" key={rel.id}>
              <Tag
                className={pillClassName}
                title={note !== '' ? rel.note : undefined}
                action={
                  <button
                    type="button"
                    className="dossier-rel-pill__action"
                    aria-label={editing ? t('detail.relation.collapse') : t('detail.relation.edit')}
                    title={editing ? t('detail.relation.collapse') : t('detail.relation.edit')}
                    onClick={() => setEditingId(editing ? null : rel.id)}
                  >
                    {editing ? '▾' : '▸'}
                  </button>
                }
                closeLabel={t('detail.relation.removePill', {
                  name: displayName(peerName(rel))
                })}
                onClose={() => setRemoving(rel)}
              >
                {pillText(rel)}
              </Tag>
            </li>
          )
        })}
      </ul>

      {editingRelation !== null ? (
        <div className="dossier-rel-editor" key={editingRelation.id}>
          <Select
            ariaLabel={t('detail.relation.typeLabel')}
            value={editingRelation.semanticCode ?? ''}
            placeholder={t('detail.relation.typePlaceholder')}
            onChange={(next) => onUpdate(editingRelation.id, { semanticCode: next })}
            options={optionsFor(editingRelation)}
          />
          {direction === 'in' ? (
            <div className="dossier-rel-hint">{t('detail.relation.incomingTypeHint')}</div>
          ) : null}
          <Input
            defaultValue={editingRelation.note}
            placeholder={t('detail.relation.notePlaceholder')}
            aria-label={t('detail.relation.noteLabel')}
            autoComplete="off"
            spellCheck={false}
            onBlur={(event) => {
              const next = event.currentTarget.value
              if (next !== editingRelation.note) onUpdate(editingRelation.id, { note: next })
            }}
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title={t('detail.removeRelation')}
        message={t('detail.relation.removeMessage', {
          name: removing === null ? '' : displayName(peerName(removing))
        })}
        confirmText={tCommon('confirm')}
        cancelText={tCommon('cancel')}
        onConfirm={() => {
          const target = removing
          setRemoving(null)
          if (target !== null) onRemove(target.id)
        }}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}
