/**
 * 伏笔列表单卡（中栏网格单元）：
 * 1. 名称 + 状态胶囊 + 删除按钮（常显）；
 * 2. 描述摘要（**紧跟名称下方**，统一 4 行裁剪）；
 * 3. 埋点位置（「卷 · 章」完整位置 / 大纲条目名，未锚定显示占位）；
 * 4. 大纲埋点位置（**仅** `outlineKind !== 'none'` 时渲染，未使用大纲槽位不占行）；
 * 5. 回收位置（同上，未回收显示占位）；
 * 6. 相关实体（描述与三处锚点摘抄里出现的实体；无实体不渲染该行）。
 *
 * 结构 / 公共视觉规格统一由通用壳 `EntityStyleCard` 提供（标题行、描述区、元信息区、
 * 底部胶囊区与操作按钮槽）；本文件只组合域内内容，并挂 `foreshadow-item` 语义类供
 * `writer-foreshadow.css` 做域内覆写（AGENTS §9：不复制平行卡片）。
 *
 * 卡根是壳输出的 `<article>`：可选中变体带 `role="button"`（`<button>` 不能内嵌
 * 删除按钮，故改用可聚焦容器 + 键盘 Enter / Space 选中）；hover / 选中光晕复用通用
 * `.wf-card--halo`（仅描边 / 阴影变化，无 transform，AGENTS §8）。删除按钮自身按键
 * 不冒泡到卡片。实体胶囊按 `useChipOverflow` 单行收口，「+N」悬停浮窗列出被收口的实体；
 * 实体悬停卡由列表层统一挂一个 `HoverCard`（网格事件委托），本卡只透传控制器给
 * 「+N」浮窗使用。
 *
 * 变体（AGENTS §9：同组件按参数覆写，不复制平行卡片）：
 * - `readonly`：章节右栏「伏笔」总览用——**只**负责不渲染删除按钮；卡片是否可交互
 *   由 `onSelect` 是否存在决定（有 `onSelect` 仍保留 `role="button"` / 键盘选中，
 *   先例见剧情只读卡 `SceneCard`）；
 * - `compact`：右栏窄栏用——收窄内衬 / 字号，描述由 4 行降为 2 行
 *   （样式见 `writer-foreshadow.css`）。
 */
import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { deriveForeshadowStatus } from '../../../../../shared/foreshadowStatus'
import { TrashIcon } from '../../../components/icons'
import { useChipOverflow } from '../../../components/useChipOverflow'
import { useOverflowPopup } from '../../../components/useOverflowPopup'
import { EntityStyleCard, IconButton, Tag, useTooltip } from '../../../components/ui'
import { EntityCardMorePopup } from '../entities/EntityCardMorePopup'
import type { EntityCardMoreItem } from '../entities/EntityCardMorePopup'
import type { useEntityHover } from '../entities/useEntityHover'
import { entityChipClass } from '../dossier/relationChip'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import { useChapterLabels } from '../chapters/useChapterLabels'
import type { OutlineItemRow } from '../outline/outlineTree'
import {
  foreshadowPlaceLabel,
  FORESHADOW_STATUS_LABEL_KEYS,
  FORESHADOW_STATUS_TONES,
  resolveForeshadowAnchor,
  resolveForeshadowAnchor2,
  resolveForeshadowRecoverAnchor,
  type ForeshadowRow
} from './foreshadowTree'
import type { ForeshadowEntityChip } from './useForeshadowEntityMatches'

/** 「+N」计数胶囊的语义类：`useChipOverflow` 的 `moreSelector` 靠它把计数槽排除在容量测量外。 */
const MORE_CHIP_CLASS = 'foreshadow-item__entity-more'

export interface ForeshadowItemProps {
  row: ForeshadowRow
  active: boolean
  /** 未删除章（解析章节锚点目标名 / 失效判定）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（补全章节锚点的「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
  /** 未删除大纲条目（解析大纲锚点目标名 / 失效判定）。 */
  outlineItems: readonly OutlineItemRow[]
  /** 该行「相关实体」（列表层批量匹配并去重；空数组 = 不渲染该行）。 */
  entities: readonly ForeshadowEntityChip[]
  /** 布局签名（单卡内容可用宽，px）：变化时触发实体胶囊容量重测。 */
  layoutKey: number
  /** 列表层共用的实体悬停控制器（悬停卡由列表层渲染；卡内仅「+N」浮窗使用）。 */
  entityHover: ReturnType<typeof useEntityHover>
  /** 只读变体：不渲染删除按钮；可交互性由 `onSelect` 是否存在决定（章节右栏总览用）。 */
  readonly?: boolean
  /** 紧凑变体：收窄内衬 / 字号与描述行数（右栏窄栏用）。 */
  compact?: boolean
  onSelect?: (id: number) => void
  /** 请求删除（由中栏视图弹二次确认，本卡不直接落库）。 */
  onDelete?: (id: number) => void
}

interface PlaceLineProps {
  label: string
  value: string
  /** 值为占位文案（未锚定 / 未回收 / 失效）时改用弱化色。 */
  empty: boolean
}

/**
 * 单行「位置」：左侧固定标签 + 右侧单行截断值。
 *
 * tooltip 挂在**值元素**而非整行：截断（`text-overflow: ellipsis`）只发生在值上，
 * 悬停左侧标签不应弹出位置；且锚点宽就是值本身，浮层水平居中更贴合被截断的文本。
 * 空占位（未锚定 / 未回收 / 锚点失效）不给 `content`，`useTooltip` 即不显示浮层。
 * 无障碍：值文本在 DOM 中始终完整（省略号只是视觉裁剪），读屏本就能取到全值；
 * 另由 `anchorProps` 附带 `aria-describedby`（指向浮层），与项目其它 tooltip 同口径。
 */
function PlaceLine({ label, value, empty }: PlaceLineProps) {
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLSpanElement>({
    content: empty ? '' : value,
    placement: 'top'
  })

  return (
    <>
      {tooltip}
      <div className="foreshadow-item__place">
        <span className="foreshadow-item__place-label">{label}</span>
        <span
          ref={anchorRef}
          {...anchorProps}
          className={`foreshadow-item__place-value${empty ? ' is-empty' : ''}`}
        >
          {value}
        </span>
      </div>
    </>
  )
}

export default function ForeshadowItem({
  row,
  active,
  chapters,
  volumes,
  outlineItems,
  entities,
  layoutKey,
  entityHover,
  readonly = false,
  compact = false,
  onSelect,
  onDelete
}: ForeshadowItemProps) {
  const { t } = useTranslation('foreshadow')
  const labels = useChapterLabels()

  const plant = resolveForeshadowAnchor(row, chapters, volumes, outlineItems)
  // 大纲埋点按需解析：未使用大纲槽位（`none`）时不算、不渲染，避免每张卡多一行空占位。
  const plant2 =
    row.outlineKind === 'none'
      ? null
      : resolveForeshadowAnchor2(row, chapters, volumes, outlineItems)
  const recover = resolveForeshadowRecoverAnchor(row, chapters, volumes, outlineItems)

  // 位置串 = 完整锚点位置（章节「卷X 卷名 · 第X章 章名」/ 大纲条目名），
  // 行首已有「埋点位置 / 回收位置」标签，不再重复「章节 ·」前缀。
  const plantTarget = foreshadowPlaceLabel(plant, labels, t('anchor.unnamedTarget'))
  const plant2Target =
    plant2 === null ? null : foreshadowPlaceLabel(plant2, labels, t('anchor.unnamedTarget'))
  const recoverTarget = foreshadowPlaceLabel(recover, labels, t('anchor.unnamedTarget'))
  const plantText =
    plantTarget ??
    (plant.state === 'invalid' ? t('listItem.anchorInvalid') : t('detail.plantEmpty'))
  const plant2Text =
    plant2 === null
      ? null
      : (plant2Target ??
        (plant2.state === 'invalid' ? t('listItem.anchorInvalid') : t('detail.plantEmpty')))
  const recoverText =
    recoverTarget ??
    (recover.state === 'invalid' ? t('listItem.anchorInvalid') : t('detail.recoverEmpty'))
  // 状态胶囊按派生展示状态渲染（落库 `status` 只是废弃标记，AGENTS §10 / 派生口径）。
  const displayStatus = deriveForeshadowStatus(row)

  // 相关实体行：单行容量按卡内容实测宽收口，「+N」不计入容量测量。
  const entityListRef = useRef<HTMLDivElement | null>(null)
  const capacity = useChipOverflow(entityListRef, entities.length, layoutKey, {
    maxRows: 1,
    moreSelector: `.${MORE_CHIP_CLASS}`
  })
  // 有溢出时容量先扣 1 给「+N」计数胶囊（与档案卡 / 剧情场景卡同口径）。
  let visibleCount = Math.min(entities.length, capacity)
  if (entities.length - visibleCount > 0) {
    visibleCount = Math.max(0, Math.min(entities.length, capacity - 1))
  }
  const visibleEntities = entities.slice(0, visibleCount)
  const hiddenEntities = entities.slice(visibleCount)
  const hiddenCount = hiddenEntities.length
  // 「+N」浮窗开合（悬停即开 / 延迟收起）。
  const {
    anchor: moreAnchor,
    open: openMore,
    cancelClose: cancelMoreClose,
    scheduleClose: scheduleCloseMore
  } = useOverflowPopup()
  // 被收口的实体：无溢出时不构建条目（避免多余分配）。
  const moreItems: EntityCardMoreItem[] =
    hiddenCount > 0
      ? hiddenEntities.map((entity) => ({
          peerId: entity.entityId,
          label: entity.name,
          chipClass: entityChipClass(entity.type, entity.presetKey)
        }))
      : []

  // 卡片交互性与 `readonly` 解耦：只有传了 `onSelect` 才是可点 / 可键盘选中的卡
  // （右栏总览既是 `readonly`（无删除按钮）又可点进只读详情）。无 `onSelect` = 纯展示。
  const interactive = onSelect !== undefined

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    // 只处理卡片自身获得焦点时的按键；卡内删除按钮的 Enter / Space 不触发选中。
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect?.(row.id)
  }

  return (
    <EntityStyleCard
      className="foreshadow-item"
      active={active}
      // 壳的 `readonly` 只管光标（不暗示可点）：有 `onSelect` 时仍按可交互卡渲染。
      readonly={!interactive}
      compact={compact}
      cardProps={{
        // 交互性只看 `onSelect`：有则保留按钮语义与键盘选中，无则纯展示。
        role: interactive ? 'button' : undefined,
        tabIndex: interactive ? 0 : undefined,
        'aria-pressed': interactive ? active : undefined,
        onClick: interactive ? () => onSelect?.(row.id) : undefined,
        onKeyDown: interactive ? handleKeyDown : undefined
      }}
      head={
        <>
          <span className="wf-entity-card__title foreshadow-item__title">
            {row.title.trim() === '' ? t('field.untitled') : row.title}
          </span>
          <Tag tone={FORESHADOW_STATUS_TONES[displayStatus]} className="foreshadow-item__status">
            {t(FORESHADOW_STATUS_LABEL_KEYS[displayStatus])}
          </Tag>
        </>
      }
      actions={
        readonly || onDelete === undefined ? undefined : (
          <IconButton
            size="sm"
            tone="danger"
            label={t('action.delete')}
            tooltipPlacement="top"
            onClick={(event) => {
              event.stopPropagation()
              onDelete(row.id)
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <TrashIcon />
          </IconButton>
        )
      }
      description={row.description.trim() === '' ? undefined : row.description}
      descriptionClassName="foreshadow-item__desc"
      info={
        <>
          <PlaceLine label={t('detail.plant')} value={plantText} empty={plantTarget === null} />
          {plant2Text === null ? null : (
            <PlaceLine
              label={t('detail.plant2')}
              value={plant2Text}
              empty={plant2Target === null}
            />
          )}
          <PlaceLine
            label={t('detail.recover')}
            value={recoverText}
            empty={recoverTarget === null}
          />
        </>
      }
      chips={
        entities.length === 0 ? undefined : (
          // 胶囊只提供悬停（实体卡）；点击落在胶囊上时不触发卡片选中。
          <>
            {visibleEntities.map((entity) => (
              <span
                key={entity.entityId}
                className={`foreshadow-item__entity chip-pill ${entityChipClass(entity.type, entity.presetKey)}`}
                data-entity-id={entity.entityId}
              >
                <span className="foreshadow-item__entity-name">{entity.name}</span>
              </span>
            ))}
            {hiddenCount > 0 ? (
              <span
                className={`foreshadow-item__entity-more chip-pill chip-pill--neutral`}
                aria-label={t('listItem.moreEntities', { n: hiddenCount })}
                onMouseEnter={(event) => {
                  // 收掉可能残留的实体悬停卡（「+N」没有 data-entity-id，委托不会自动隐藏）。
                  entityHover.close()
                  openMore(event.currentTarget)
                }}
                onMouseLeave={scheduleCloseMore}
              >
                +{hiddenCount}
              </span>
            ) : null}
          </>
        )
      }
      chipsRef={entityListRef}
      chipsClassName="foreshadow-item__entities"
      chipsProps={{
        role: 'group',
        'aria-label': t('listItem.relatedEntities'),
        onClick: (event) => event.stopPropagation()
      }}
      popup={
        moreAnchor !== null && moreAnchor.isConnected && moreItems.length > 0 ? (
          // 浮窗内胶囊经 portal 渲染、事件不冒泡到网格委托：显式给锚点展示实体卡。
          <EntityCardMorePopup
            anchorEl={moreAnchor}
            items={moreItems}
            onPointerEnter={() => {
              cancelMoreClose()
              entityHover.cancelHide()
            }}
            onPointerLeave={() => {
              scheduleCloseMore()
              entityHover.onMouseLeave()
            }}
            onItemEnter={entityHover.showFor}
            onItemLeave={entityHover.onMouseLeave}
          />
        ) : undefined
      }
    />
  )
}
