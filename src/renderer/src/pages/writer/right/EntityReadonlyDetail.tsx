/**
 * 章节 / 大纲模块右栏「实体」页签的**只读详情**（列表 → 详情两级视图的第二级）。
 *
 * - 结构：名称 + 类型胶囊 / 类别 / 别名 / 首次登场 / 全量关系 / 品阶与档位（仅物品） /
 *   **富文本正文**；壳复用共享 `ReadonlyDetailShell`（灵感页签同款，CSS 在
 *   `styles/writer-right-panels.css`）；
 * - **富文本**：列表行只有纯文本 `body`，选中时额外拉一次 `worldEntity:get` 取 `bodyJson`，
 *   交给 `EntityReadonlyRichText`（保留标题 / 列表 / 加粗；`hoverCard={false}`——整个面板
 *   只挂一个 `HoverCard`，正文与关系胶囊共用同一套事件委托）。读取中显示通用加载文案；
 *   读取失败回退列表行纯文本，不把失败说成「暂无正文」；
 * - **首次登场**：与设定档案卡同源（`useFirstAppearances` 按书缓存一次 IPC），
 *   加载 / 失败时不渲染该行；
 * - **只读**：无 Input、无保存条、无删除 / 编辑入口，唯一操作是底部「返回」。
 */
import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag } from '../../../components/ui'
import type { DossierRow, WorldEntityType } from '../dossier/dossierTree'
import { dossierCardRelations } from '../dossier/dossierCardRelations'
import { FirstAppearanceLine } from '../dossier/FirstAppearanceLine'
import { entityChipClass } from '../dossier/relationChip'
import { useFirstAppearances } from '../dossier/useFirstAppearances'
import { useRelationLabels } from '../dossier/useRelationLabels'
import { EntityReadonlyRichText } from '../entities/EntityReadonlyRichText'
import type { useEntityHover } from '../entities/useEntityHover'
import { ReadonlyDetailShell } from './ReadonlyDetailShell'

/** 实体类型 → `entities` ns 的类型文案 key（静态映射，避免拼接 key 丢类型）。 */
const TYPE_LABEL_KEYS = {
  worldview: 'type.worldview',
  character: 'type.character',
  item: 'type.item',
  faction: 'type.faction',
  power_system: 'type.power_system'
} as const satisfies Record<WorldEntityType, string>

/** 富文本正文读取结果（按实体 id 标记，切换行时天然回到加载态）。 */
interface BodyState {
  id: number
  /** 整条块级 JSON；`null` = 空正文。 */
  json: string | null
  /** 是否读取失败（回退列表行纯文本）。 */
  failed: boolean
}

export interface EntityReadonlyDetailProps {
  /** 当前选中的实体行（列表命中项；行被删 / 刷新后由外层回落列表）。 */
  row: DossierRow
  /** 归属书 id（正文实体高亮按书匹配）。 */
  bookId: string
  /** 列表层共用的实体悬停控制器（`HoverCard` 仍由列表层渲染）。 */
  entityHover: ReturnType<typeof useEntityHover>
  /** 返回列表。 */
  onBack: () => void
}

/** 只读详情：名称 + 类型 / 类别 / 别名 / 首次登场 / 关系 / 品阶档位 / 富文本正文。 */
export function EntityReadonlyDetail({
  row,
  bookId,
  entityHover,
  onBack
}: EntityReadonlyDetailProps): ReactElement {
  const { t } = useTranslation('entities')
  const { t: tDossier } = useTranslation('dossier')
  const { t: tCommon } = useTranslation('common')

  // 富文本正文：选中时补一次 `get`（列表行只有纯文本摘要）。
  const [body, setBody] = useState<BodyState | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.api.worldEntity
      .get(row.id)
      .then((detail) => {
        if (cancelled) return
        setBody({
          id: row.id,
          json: detail === null || detail.bodyJson === '' ? null : detail.bodyJson,
          failed: false
        })
      })
      .catch(() => {
        if (cancelled) return
        setBody({ id: row.id, json: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [row.id])
  const currentBody = body !== null && body.id === row.id ? body : null

  // 首次登场：`undefined` = 无数据（加载中 / 失败）→ 不渲染，避免空行跳变。
  const firstAppearances = useFirstAppearances(bookId)
  const firstAppearance =
    firstAppearances.map !== null &&
    Object.prototype.hasOwnProperty.call(firstAppearances.map, row.id)
      ? firstAppearances.map[row.id]
      : undefined

  const relationLabels = useRelationLabels()
  const relations = dossierCardRelations(row.relations, relationLabels)
  const grade = row.grade.trim()
  const hasItemMeta = row.entityType === 'item' && (grade !== '' || row.rank > 0)
  const name = row.name.trim()
  const category = row.subType.trim()

  return (
    <ReadonlyDetailShell
      backLabel={t('detail.back')}
      onBack={onBack}
      onMouseOver={entityHover.onMouseOver}
      onMouseLeave={entityHover.onMouseLeave}
    >
      <div className="wf-entity-detail__head wf-readonly-block">
        <span className="wf-entity-detail__title">{name === '' ? tDossier('unnamed') : name}</span>
        <Tag
          tone="neutral"
          className={`wf-entity-detail__type ${entityChipClass(row.entityType, '')}`}
        >
          {t(TYPE_LABEL_KEYS[row.entityType])}
        </Tag>
      </div>

      <div className="wf-entity-detail__section">
        <div className="wf-entity-detail__label">{t('detail.category')}</div>
        <div className="wf-entity-detail__chips wf-readonly-block">
          <span className={`chip-pill ${entityChipClass(row.entityType, row.presetKey)}`}>
            {category === '' ? tDossier('subTypeUncategorized') : category}
          </span>
        </div>
      </div>

      {row.aliases.length === 0 ? null : (
        <div className="wf-entity-detail__section">
          <div className="wf-entity-detail__label">{t('aliases')}</div>
          <div className="wf-entity-detail__chips wf-readonly-block">
            {row.aliases.map((alias, index) => (
              <Tag key={`alias-${index}`} tone="neutral">
                {alias}
              </Tag>
            ))}
          </div>
        </div>
      )}

      <FirstAppearanceLine
        place={firstAppearance}
        label={t('firstAppearance')}
        emptyLabel={t('firstAppearanceNone')}
      />

      {relations.items.length === 0 ? null : (
        <div className="wf-entity-detail__section">
          <div className="wf-entity-detail__label">{t('relations')}</div>
          <div
            className="wf-entity-detail__chips wf-readonly-block"
            role="group"
            aria-label={t('relations')}
          >
            {relations.items.map((item, index) => (
              <span
                key={`relation-${index}`}
                className={`chip-pill ${item.chipClass}`}
                data-entity-id={item.peerId}
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {hasItemMeta ? (
        <div className="wf-entity-detail__meta wf-readonly-block">
          <span className="wf-entity-detail__meta-label">{tDossier('detail.gradeLabel')}</span>
          <span className="wf-entity-detail__meta-value">
            {grade === '' ? tDossier('detail.emptyValue') : grade}
          </span>
          <span className="wf-entity-detail__meta-label">{tDossier('detail.rankLabel')}</span>
          <span className="wf-entity-detail__meta-value">
            {row.rank > 0 ? String(row.rank) : tDossier('detail.emptyValue')}
          </span>
        </div>
      ) : null}

      <div className="wf-entity-detail__section wf-entity-detail__section--body">
        <div className="wf-entity-detail__label">{tDossier('detail.bodyLabel')}</div>
        {currentBody === null ? (
          <div className="wf-entity-detail__placeholder wf-readonly-block">
            {tCommon('loading')}
          </div>
        ) : currentBody.failed ? (
          <div className="wf-entity-detail__platext wf-readonly-block">
            {row.body.trim() === '' ? t('detail.bodyEmpty') : row.body}
          </div>
        ) : (
          <EntityReadonlyRichText
            bookId={bookId}
            json={currentBody.json}
            emptyText={t('detail.bodyEmpty')}
            className="wf-entity-detail__body wf-readonly-block"
            hoverCard={false}
          />
        )}
      </div>
    </ReadonlyDetailShell>
  )
}

export default EntityReadonlyDetail
