import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Select, Tag } from '../../../components/ui'
import ConfirmDialog from '../ConfirmDialog'
import type { DossierRelationPatch, WorldRefRow } from './dossierTree'
import { isRelationPrefixSuppressed } from './relationChip'
import { useRelationLabels } from './useRelationLabels'

/** 关系方向：出边（我 → 对方）/ 入边（对方 → 我）。 */
export type RelationDirection = 'out' | 'in'

/** 关系类型下拉选项（与 `Select` 的选项同形）。 */
export interface RelationTypeOption {
  value: string
  label: string
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
  /** 方向（决定对端字段与胶囊文案的方向映射）。 */
  direction: RelationDirection
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
 * - **对端**：出边读 `toName`（当前条目指向谁），入边读 `fromName`（谁指向当前条目）；
 * - **文案前缀**：出边 / 入边共用同一套「对端身份」映射（`useRelationLabels().peerLabel`，
 *   由 i18n 提供，不以「我」为中心）：当前条目是 `from` 时 `superior` 读作「下级 对端名」，
 *   是 `to` 时同一码读作「上级 对端名」；平级（`peer`）与未知 / 空码只显示对端名。
 *   `belongs_to` 一律免前缀（只显示对端名，所有实体类型、出边入边同款），与卡片摘要
 *   （`dossierCardRelations.ts` 的 `relationChipLabel`）共用同一判断（`relationChip.ts` 的
 *   `isRelationPrefixSuppressed`），两边口径一致。
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
  relations,
  optionsFor,
  pillClassOf,
  onUpdate,
  onRemove
}: RelationListProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const { peerLabel } = useRelationLabels()
  /** 当前展开编辑的行（同一列表内只展开一行）。 */
  const [editingId, setEditingId] = useState<number | null>(null)
  /** 待确认删除的行（null = 未弹确认）。 */
  const [removing, setRemoving] = useState<WorldRefRow | null>(null)

  const displayName = (name: string): string => (name.trim() === '' ? t('unnamed') : name)

  /** 对端名称：出边取目标，入边取来源。 */
  const peerName = (rel: WorldRefRow): string => (direction === 'out' ? rel.toName : rel.fromName)

  /**
   * 胶囊前缀（出边 / 入边同一套逻辑）：取对端身份标签；`peer` / 空码 / `belongs_to` 无前缀
   * （只显示对端名，规则与卡片摘要共用 `isRelationPrefixSuppressed`）。
   * 未知码（绕过写入路径的历史残留）回退字典备注，再回退「自定义关系」。
   */
  const pillPrefix = (rel: WorldRefRow): string => {
    const code = rel.semanticCode ?? ''
    if (isRelationPrefixSuppressed(code)) return ''
    const label = peerLabel(code, direction)
    if (label !== '' || code === '' || code === 'peer') return label
    return rel.semanticNote.trim() !== '' ? rel.semanticNote : t('detail.relation.custom')
  }

  /** 胶囊正文：前缀非空时读作「前缀 对端名」，否则只显示对端名。 */
  const pillText = (rel: WorldRefRow): string => {
    const peer = displayName(peerName(rel))
    const prefix = pillPrefix(rel)
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
