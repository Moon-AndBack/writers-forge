import { useTranslation } from 'react-i18next'
import { Combobox, Select, Textarea } from '../../../components/ui'
import RelationList from './RelationList'
import { RELATION_TARGET_MODULES } from './dossierTree'
import type {
  DossierRelationPatch,
  RelationTargetModule,
  WorldEntityType,
  WorldRefRow
} from './dossierTree'
import type { RelationDraftState } from './useRelationDraft'

export interface RelationEditorProps {
  /**
   * 新增关系表单（受控）：状态与派生逻辑由弹窗层的 `useRelationDraft` 持有，
   * 表单与 footer 的「添加关系」按钮共用同一份 `canAdd` / `addRelation`。
   */
  draft: RelationDraftState
  /** 出边关系（当前实体指向他人的关系）。 */
  relations: WorldRefRow[]
  /** 当前实体类型（出边物品的 `belongs_to` 胶囊只显示目标名）。 */
  entityType: WorldEntityType
  /** 入边关系（他人指向当前实体的关系；类型 / 备注可改、可删，关联对象只读）。 */
  incoming: WorldRefRow[]
  /** 更新关系（类型 / 备注）。 */
  onUpdate: (refId: number, patch: DossierRelationPatch) => void
  /** 删除关系。 */
  onRemove: (refId: number) => void
}

/**
 * 关系编辑区（第 7 批拆分，第 8 批改为受控表单）：
 *
 * - **新增关系为四行表单**：① 模块 + 类别（并排）；② 具体项目（可输入模糊匹配的
 *   组合框）；③ 关系类型；④ 备注（多行文本，约三个下拉高）。「添加关系」按钮已移到
 *   弹窗 footer 右侧（`DossierRelationsDialog`），表单本身不再渲染按钮；
 *   模块 → 类别 → 项目三级联动（候选为本书世界观 / 角色 / 势力 / 境界体系 / 物品功法的
 *   实体，可跨模块选取目标），改上级清空下级；
 * - **已有关联紧跟备注下方**：表单与出边胶囊列表同处一个分区，不再被标题 / 按钮行隔开；
 * - **关系类型按模块组合过滤**（`relationCodesForPair`）：势力之间只给
 *   「上级 / 下级 / 平级」，其余组合只给「属于」；目标模块变更时自动切到该组合首项；
 * - **自动反向**：当前实体是角色、目标是物品时，提示「将记录为：物品属于角色」，
 *   提交带 `reverse: true`，由装配层写成 `from = 物品`、`to = 角色`；
 * - 出边关系以**胶囊列表**展示「关系类型 目标名」（平级只显示目标名；物品的 `belongs_to`
 *   也只显示目标名，不带「属于」前缀），不同语义码底色不同；胶囊内 ▸/▾ 展开就地改类型 /
 *   备注，× 删除（二次确认），悬停显示备注（空备注不出 tip）；
 * - **入边列表（「被引用」）与出边共用同一份胶囊渲染**（`RelationList` + `direction`）：
 *   类型 / 备注同样可就地改、关系可删（二次确认）；关联对象（对方名称）只读，
 *   因为端点由对方条目发起。类型码仍描述 `from → to`，入边的 from 是对方，故候选按
 *   `relationCodesForPair(对方类型, 当前类型)` 过滤，下拉文案补「反向读法」提示（说明
 *   记录方向仍是「对方 → 我」）；胶囊与出边同为正向读法（如「上级 砚境」「下级 抄书阁」，
 *   平级只显示对方名），仅 `belongs_to` 保留反向收尾（如「锻笔剑 属于我」），避免
 *   「属于 对方名」被误读为「我属于对方」；
 * - 补充说明（`role`）已下线：新增固定写空串，列表既不展示也不编辑，存量值按空处理。
 *
 * 使用方：世界观 / 角色 / 势力 / 物品功法四域卡片的关系按钮弹窗
 * （`DossierRelationsDialog`）；境界体系无卡片关系入口，故不挂载。
 *
 * 兼容：老库 `semantic_code IS NULL` 的行在 `worldRefs:hierarchy:v1` 迁移中已清空；
 * 展示侧仍保留「自定义关系」兜底，仅防御绕过写入路径的残留。
 */
export default function RelationEditor({
  draft,
  relations,
  entityType,
  incoming,
  onUpdate,
  onRemove
}: RelationEditorProps) {
  const { t } = useTranslation('dossier')
  const { t: tModule } = useTranslation('module')
  const { t: tCommon } = useTranslation('common')
  const {
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
    typeSelectable,
    categoryOptions,
    targetOptions,
    typeOptions,
    targetsLoading,
    optionsFor,
    pillColorClass
  } = draft

  return (
    <div className="dossier-detail__section">
      <div className="dossier-rel-add">
        <div className="dossier-rel-add__row">
          <Select
            ariaLabel={t('detail.relation.moduleLabel')}
            value={targetModule}
            placeholder={t('detail.relation.modulePlaceholder')}
            onChange={(next) =>
              setTargetModule(next === '' ? '' : (next as RelationTargetModule))
            }
            options={RELATION_TARGET_MODULES.map((id) => ({ value: id, label: tModule(id) }))}
          />
          <Select
            ariaLabel={t('detail.relation.categoryLabel')}
            value={targetCategory}
            placeholder={t('detail.relation.categoryPlaceholder')}
            disabled={targetModule === ''}
            onChange={setTargetCategory}
            options={categoryOptions}
          />
        </div>
        <Combobox
          ariaLabel={t('detail.relation.targetLabel')}
          value={targetId}
          placeholder={t('detail.relation.targetSearchPlaceholder')}
          disabled={targetCategory === ''}
          onChange={setTargetId}
          options={targetOptions}
          emptyText={targetsLoading ? tCommon('loading') : undefined}
        />
        <Select
          ariaLabel={t('detail.relation.typeLabel')}
          value={typeCode}
          placeholder={t('detail.relation.typePlaceholder')}
          onChange={setTypeCode}
          options={typeOptions}
          disabled={!typeSelectable}
        />
        <Textarea
          className="dossier-rel-add__note"
          rows={3}
          value={note}
          placeholder={t('detail.relation.notePlaceholder')}
          aria-label={t('detail.relation.noteLabel')}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setNote(event.target.value)}
        />
        {reverse ? (
          <div className="dossier-rel-add__hint">{t('detail.relation.reverseHint')}</div>
        ) : null}
      </div>

      {relations.length === 0 ? (
        <div className="dossier-detail__empty">{t('detail.relationsEmpty')}</div>
      ) : (
        <RelationList
          direction="out"
          entityType={entityType}
          relations={relations}
          optionsFor={(rel) => optionsFor(rel, 'out')}
          pillClassOf={(rel) => pillColorClass(rel, 'out')}
          onUpdate={onUpdate}
          onRemove={onRemove}
        />
      )}

      {incoming.length > 0 ? (
        <div className="dossier-rel-incoming">
          <div className="dossier-detail__label">{t('detail.relation.incomingTitle')}</div>
          <div className="dossier-rel-hint">{t('detail.relation.incomingHint')}</div>
          <RelationList
            direction="in"
            relations={incoming}
            optionsFor={(rel) => optionsFor(rel, 'in')}
            pillClassOf={(rel) => pillColorClass(rel, 'in')}
            onUpdate={onUpdate}
            onRemove={onRemove}
          />
        </div>
      ) : null}
    </div>
  )
}
