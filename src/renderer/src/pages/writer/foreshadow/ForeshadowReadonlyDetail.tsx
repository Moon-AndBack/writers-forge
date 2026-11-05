/**
 * 章节模块右栏「伏笔」页签的**只读详情**（列表 → 详情两级视图的第二级）。
 *
 * 结构复用伏笔模块右栏：`.foreshadow-panel` > `.foreshadow-panel__scroll` >
 * `.foreshadow-fields`，三个锚点块直接复用 `ForeshadowAnchorBlock`（**不传** `action`，
 * 因而没有「移除」入口）。本组件不渲染 Input / `ForeshadowDescriptionField` / `SaveBar` /
 * 废弃 / 删除 / 确认框——详情是纯展示，唯一操作是底部返回栏的「返回」。
 *
 * 描述走 `ReadonlyRichText`（只读富文本），并通过可选 `extensions` 注入
 * `EntityHighlight`（按书匹配、打开即有内容），与伏笔模块右栏描述的实体高亮同源；
 * 实体悬停卡复用列表层传入的 `useEntityHover` 实例（整块详情挂事件委托），避免重复挂
 * 第二个 `HoverCard`。描述里的高亮与「相关实体」胶囊共用同一套悬停定位。
 */
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { deriveForeshadowStatus } from '../../../../../shared/foreshadowStatus'
import { sliceSelectedText } from '../../../../../shared/foreshadowAnchorText'
import ReadonlyRichText from '../../../components/editor/ReadonlyRichText'
import { Button, Tag } from '../../../components/ui'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import { entityChipClass } from '../dossier/relationChip'
import { EntityHighlight } from '../entities/entityHighlight'
import type { useEntityHover } from '../entities/useEntityHover'
import type { OutlineItemRow } from '../outline/outlineTree'
import ForeshadowAnchorBlock from './ForeshadowAnchorBlock'
import {
  FORESHADOW_STATUS_LABEL_KEYS,
  FORESHADOW_STATUS_TONES,
  resolveForeshadowAnchor,
  resolveForeshadowAnchor2,
  resolveForeshadowDescriptionJson,
  resolveForeshadowRecoverAnchor,
  type ForeshadowRow
} from './foreshadowTree'
import type { ForeshadowEntityChip } from './useForeshadowEntityMatches'

export interface ForeshadowReadonlyDetailProps {
  /** 当前选中的伏笔行（列表命中项；行被删 / 刷新后由外层回落列表）。 */
  row: ForeshadowRow
  /** 归属书 id（描述富文本的实体高亮按书匹配）。 */
  bookId: string
  /** 未删除章（解析章节锚点目标名 / 失效判定）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（补全章节锚点的「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
  /** 未删除大纲条目（解析大纲锚点目标名 / 失效判定）。 */
  outlineItems: readonly OutlineItemRow[]
  /** 该行「相关实体」（列表层批量匹配结果，平铺展示）。 */
  entities: readonly ForeshadowEntityChip[]
  /** 列表层共用的实体悬停控制器（`HoverCard` 仍由列表层渲染）。 */
  entityHover: ReturnType<typeof useEntityHover>
  /** 返回列表。 */
  onBack: () => void
}

/** 只读详情：名称 + 状态 / 只读描述 / 三个锚点块 / 相关实体 / 底部返回栏。 */
export function ForeshadowReadonlyDetail({
  row,
  bookId,
  chapters,
  volumes,
  outlineItems,
  entities,
  entityHover,
  onBack
}: ForeshadowReadonlyDetailProps): ReactElement {
  const { t } = useTranslation('foreshadow')

  // 状态与中栏卡片 / 右栏编辑面板同口径：由锚点与废弃标记派生，不读落库 `status`。
  const displayStatus = useMemo(() => deriveForeshadowStatus(row), [row])

  const plant = useMemo(
    () => resolveForeshadowAnchor(row, chapters, volumes, outlineItems),
    [row, chapters, volumes, outlineItems]
  )
  // 大纲埋点仅在已使用大纲槽位时解析 / 渲染（与中栏卡、编辑面板同口径，不占空块）。
  const plant2 = useMemo(
    () =>
      row.outlineKind === 'none'
        ? null
        : resolveForeshadowAnchor2(row, chapters, volumes, outlineItems),
    [row, chapters, volumes, outlineItems]
  )
  const recover = useMemo(
    () => resolveForeshadowRecoverAnchor(row, chapters, volumes, outlineItems),
    [row, chapters, volumes, outlineItems]
  )

  // 描述富文本：与伏笔模块右栏同一套实体高亮（`getBookId` 闭包必须捕获当前书；
  // `matchOnCreate` 保证「打开即有内容」时补一次整篇匹配）。`useMemo` 保持引用恒等。
  const descriptionJson = resolveForeshadowDescriptionJson(row)
  const extensions = useMemo(
    () => [
      EntityHighlight.configure({
        getBookId: () => bookId,
        matchOnCreate: true
      })
    ],
    [bookId]
  )

  // 三个锚点块的引用块只显示选中文字（区间缺失 / 越界时切片函数回退整段）。
  const bodySelectedText = sliceSelectedText(row.bodyQuote, row.bodyCharStart, row.bodyCharEnd)
  const outlineSelectedText = sliceSelectedText(
    row.outlineQuote,
    row.outlineCharStart,
    row.outlineCharEnd
  )
  const recoverSelectedText = sliceSelectedText(
    row.recoverQuote,
    row.recoverCharStart,
    row.recoverCharEnd
  )

  // 回收备注：移除回收位置（未锚定）后不再展示，避免挂旧备注误导。
  const recoverNote =
    recover.state === 'unanchored'
      ? undefined
      : { label: t('detail.recoverNote'), value: row.recoveryNote }

  return (
    <div className="foreshadow-panel">
      {/* 事件委托覆盖描述高亮与相关实体胶囊：悬停经 `HoverCard` 显示实体卡。 */}
      <div
        className="foreshadow-panel__scroll"
        onMouseOver={entityHover.onMouseOver}
        onMouseLeave={entityHover.onMouseLeave}
      >
        <div className="foreshadow-fields on-soft">
          <div className="foreshadow-detail__head">
            <span className="foreshadow-detail__title">
              {row.title.trim() === '' ? t('field.untitled') : row.title}
            </span>
            <Tag
              tone={FORESHADOW_STATUS_TONES[displayStatus]}
              className="foreshadow-detail__status"
            >
              {t(FORESHADOW_STATUS_LABEL_KEYS[displayStatus])}
            </Tag>
          </div>

          <div className="foreshadow-detail__section foreshadow-detail__section--desc">
            <div className="foreshadow-detail__label">{t('field.description')}</div>
            <ReadonlyRichText
              json={descriptionJson}
              emptyText={t('detail.descriptionEmpty')}
              className="foreshadow-detail__desc"
              extensions={extensions}
            />
          </div>

          {entities.length === 0 ? null : (
            <div className="foreshadow-detail__section">
              <div className="foreshadow-detail__label">{t('listItem.relatedEntities')}</div>
              <div
                className="foreshadow-detail__entities"
                role="group"
                aria-label={t('listItem.relatedEntities')}
              >
                {entities.map((entity) => (
                  <span
                    key={entity.entityId}
                    className={`foreshadow-detail__entity chip-pill ${entityChipClass(entity.type, entity.presetKey)}`}
                    data-entity-id={entity.entityId}
                  >
                    <span className="foreshadow-detail__entity-name">{entity.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 三个锚点块都不传 `action`：只读详情没有「移除」入口。 */}
        <ForeshadowAnchorBlock
          label={t('detail.plant')}
          resolution={plant}
          selectedText={bodySelectedText}
          emptyText={t('detail.plantEmpty')}
        />

        {plant2 === null ? null : (
          <ForeshadowAnchorBlock
            label={t('detail.plant2')}
            resolution={plant2}
            selectedText={outlineSelectedText}
            emptyText={t('detail.plantEmpty')}
          />
        )}

        <ForeshadowAnchorBlock
          label={t('detail.recover')}
          resolution={recover}
          selectedText={recoverSelectedText}
          emptyText={t('detail.recoverEmpty')}
          note={recoverNote}
        />
      </div>

      <div className="foreshadow-detail-bar">
        <Button variant="secondary" onClick={onBack}>
          {t('detail.back')}
        </Button>
      </div>
    </div>
  )
}

export default ForeshadowReadonlyDetail
