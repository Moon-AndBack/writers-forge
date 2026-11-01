import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../../components/ui'
import RelationEditor from './RelationEditor'
import type {
  DossierModule,
  DossierRelationInput,
  DossierRelationPatch,
  DossierRow,
  WorldSemanticCodeRow
} from './dossierTree'
import { MODULE_ENTITY_TYPE } from './dossierTree'
import { useDossierRelations } from './useDossierRelations'
import { useRelationDraft } from './useRelationDraft'

export interface DossierRelationsDialogProps {
  /** 所属域（决定关系类型候选的源实体类型）。 */
  module: DossierModule
  /** 关系所属行（出边源端）。 */
  row: DossierRow
  /** 语义码字典（关系类型下拉，按当前实体类型过滤）。 */
  semanticCodes: WorldSemanticCodeRow[]
  /** 新增出边关系（即时生效，不进弹窗草稿 / 未保存守卫）。 */
  onAddRelation: (id: number, input: DossierRelationInput) => void | Promise<void>
  /** 更新关系（出边 / 入边共用；类型 / 备注，即时生效）。 */
  onUpdateRelation: (id: number, refId: number, patch: DossierRelationPatch) => void | Promise<void>
  /** 删除关系（出边 / 入边共用，即时生效）。 */
  onRemoveRelation: (id: number, refId: number) => void | Promise<void>
  /** 关闭（遮罩 / Esc / 关闭按钮 / 底部按钮）。 */
  onClose: () => void
}

/**
 * 设定档案「关联关系」独立弹窗（世界观 / 角色 / 势力 / 物品功法四域共用，按 module 参数化）：
 *
 * 由卡片上的「关联关系」按钮打开，内部整体复用 `RelationEditor`：
 * 出边可增删改（类型 / 备注），目标经「模块 → 类别 → 可搜索项目组合框」
 * 跨模块选取；入边（「被引用」）同样可改类型 / 备注、可删，仅关联对象只读；
 * 关系操作即时落库，不并入任何弹窗草稿，也不受右栏未保存守卫影响。
 * 关系类型按「当前模块 + 目标模块」过滤；角色 → 物品自动反向写为「物品属于角色」。
 * 境界体系模块无卡片入口（仍在中栏「体系信息」面板改关系），在 `DossierView` 侧不传
 * `onRelations`；其余四域（含世界观）均有入口。
 *
 * 第 8 批：新增关系表单状态由 `useRelationDraft` 上提到本层，footer 右侧直接放
 * 「添加关系」按钮（未选完目标 / 类型时禁用），表单与既有胶囊列表同区紧随。
 */
export default function DossierRelationsDialog({
  module,
  row,
  semanticCodes,
  onAddRelation,
  onUpdateRelation,
  onRemoveRelation,
  onClose
}: DossierRelationsDialogProps) {
  const { t } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')
  const title = t('relationsDialog.title')

  // 按目标行独立拉取出边 / 入边：弹窗不改右栏选中，不能依赖 bundle.detail。
  const { relations, incoming, loading, add, update, remove } = useDossierRelations(row.id, {
    onAdd: onAddRelation,
    onUpdate: onUpdateRelation,
    onRemove: onRemoveRelation
  })

  // 表单状态上提：footer 的「添加关系」与表单共用同一份 `canAdd` / `addRelation`。
  const draft = useRelationDraft({
    entityId: row.id,
    entityType: MODULE_ENTITY_TYPE[module],
    bookId: row.bookId,
    relations,
    incoming,
    semanticCodes,
    onAdd: add
  })

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      ariaLabel={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tCommon('close')}
          </Button>
          <Button variant="primary" onClick={draft.addRelation} disabled={!draft.canAdd}>
            {t('detail.addRelation')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="dossier-detail__empty">{tCommon('loading')}</div>
      ) : (
        <RelationEditor
          draft={draft}
          relations={relations}
          entityType={MODULE_ENTITY_TYPE[module]}
          incoming={incoming}
          onUpdate={update}
          onRemove={remove}
        />
      )}
    </Modal>
  )
}
