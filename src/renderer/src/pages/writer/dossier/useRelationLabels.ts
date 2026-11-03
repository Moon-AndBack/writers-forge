/**
 * 关系展示名的**渲染层唯一入口**（hook，包一层 `dossier` ns 的 i18n 映射）。
 *
 * 口径（方向事实：`from → to`，`code = superior` 表示「from 是 to 的上级」）：
 * 卡片 / 胶囊**不以「我」为中心**，而是直接描述对端身份——
 * - `superior`：出边（当前条目是 from）→「下级 对端名」；入边（当前条目是 to）→「上级 对端名」；
 * - `subordinate`：出边 →「上级 对端名」；入边 →「下级 对端名」；
 * - `belongs_to`：**没有**「属于 / 所属」前缀——胶囊一律只显示对端名（出边入边、所有实体
 *   类型同款；`peerLabel` 对它返回空串）；关系类型名（下拉里的「属于」）仍取 `typeName`；
 * - `peer`：两端都**无前缀**，只显示对端名（`peerLabel` 返回空串）。
 *
 * 未知 / 空语义码同样返回空串（调用方按「只显示对端名」兜底）；`typeName` 供关系类型下拉
 * 与兜底使用，未知码返回空串，由调用方回退 DB 备注 / 裸码。映射的三份消费方
 * （卡片摘要、关联弹窗、新增关系下拉）共用本 hook，避免各写一套中文字面量而漂移。
 */
import { useTranslation } from 'react-i18next'

/** 关系方向：`'out'` 出边（当前条目是 `from`）/ `'in'` 入边（当前条目是 `to`）。 */
export type RelationPeerDirection = 'in' | 'out'

/** 关系展示能力（纯函数形式，供 `relationChipLabel` 等非 React 模块以参数接收）。 */
export interface RelationLabels {
  /** 关系类型名（上级 / 下级 / 平级 / 属于），供下拉选项与类型名兜底；未知码返回空串。 */
  typeName: (code: string) => string
  /** 对端身份标签（下级 / 上级）；`peer` / `belongs_to` 或未知码返回空串（= 只显示对端名）。 */
  peerLabel: (code: string, direction: RelationPeerDirection) => string
}

export function useRelationLabels(): RelationLabels {
  const { t } = useTranslation('dossier')

  const typeNames: Readonly<Record<string, string>> = {
    superior: t('detail.relation.typeName.superior'),
    subordinate: t('detail.relation.typeName.subordinate'),
    peer: t('detail.relation.typeName.peer'),
    belongs_to: t('detail.relation.typeName.belongs_to')
  }

  /** 出边（当前条目是 `from`）：标签描述**对端**的身份。 */
  const outLabels: Readonly<Record<string, string>> = {
    superior: t('detail.relation.peerLabel.out.superior'),
    subordinate: t('detail.relation.peerLabel.out.subordinate')
  }

  /** 入边（当前条目是 `to`）：同一张码表从另一端看，标签随之对调。 */
  const inLabels: Readonly<Record<string, string>> = {
    superior: t('detail.relation.peerLabel.in.superior'),
    subordinate: t('detail.relation.peerLabel.in.subordinate')
  }

  return {
    typeName: (code: string): string => typeNames[code] ?? '',
    peerLabel: (code: string, direction: RelationPeerDirection): string =>
      (direction === 'out' ? outLabels : inLabels)[code] ?? ''
  }
}
