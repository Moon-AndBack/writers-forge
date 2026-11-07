import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { TrashIcon } from '../../../components/icons'
import { EntityStyleCard, IconButton } from '../../../components/ui'
import { PencilIcon } from '../icons'
// 跨域复用：剧情实体胶囊直接复用「设定档案」域的配色类名计算（模块基色 + 预设分类色），
// 不复制实现；依赖方向（剧情 → 档案）为临时态，待后续把 `relationChip` 上提到共享层收敛。
import { entityChipClass } from '../dossier/relationChip'
import { useEntityHover } from '../entities/useEntityHover'
// 跨域复用实体域的「＋N」浮窗与开合状态机（不复制实现）。
import { EntityCardMorePopup } from '../entities/EntityCardMorePopup'
import type { EntityCardMoreItem } from '../entities/EntityCardMorePopup'
import { useChipOverflow } from '../../../components/useChipOverflow'
import { useOverflowPopup } from '../../../components/useOverflowPopup'
import { plotSceneTitle, type PlotLineRow, type PlotSceneRow } from './plotTree'
import { PlotSceneHeading } from './PlotSceneHeading'
import { usePlotBodyEntities } from './usePlotBodyEntities'

interface SceneCardProps {
  scene: PlotSceneRow
  active: boolean
  /** 布局签名（可用宽 key）：变化时触发胶囊溢出重测。 */
  layoutKey: number
  /** 归属书 id（实体匹配按书隔离；空串 = 不匹配）。 */
  bookId: string
  /** 实体匹配用正文纯文本（活动场景取编辑器实时文本，其余取 `scene.description`）。 */
  bodyText: string
  onSelect: (id: number) => void
  /** 打开节点弹窗（改该场景时间 / 标题）。 */
  onEditNode: (scene: PlotSceneRow) => void
  /** 胶囊悬停委托（壳的胶囊容器级 `onMouseOver` / `onMouseLeave`）。 */
  charHover: ReturnType<typeof useEntityHover>
  /** 删除该场景节点（经卡内删除按钮二次确认后调用）。 */
  onDeleteScene: (id: number) => void
  /** 只读模式（章节右栏剧情页签）：隐藏卡内编辑 / 删除按钮，点击仍只选中。 */
  readonly?: boolean
  /** 来源剧情线（跨线聚合视图传入时在标题行上方显示线标签；单线视图不传）。 */
  line?: PlotLineRow | null
  /** 卡片悬停开始（右栏复用正文浮窗；中栏不传，行为不变）。 */
  onHoverStart?: (el: HTMLElement, target: HTMLElement) => void
  /** 卡片悬停结束（配合 `onHoverStart`）。 */
  onLeave?: () => void
}

/** 单场景卡（标题 + 编辑入口 / 描述 / 正文自动匹配的实体胶囊）；选中态落卡自身。
 * 结构 / 公共视觉规格统一由通用壳 `EntityStyleCard` 提供（与设定档案卡 / 伏笔卡同款）：
 * 标题行走 `head`、编辑 / 删除走 `actions`（`IconButton size="sm"`）、描述走
 * `description`（4 行裁剪由 `.plot-scene-body` 控制）、实体胶囊走 `chips`
 * （卡内底部，描述下方），不再作为卡片兄弟节点悬挂在卡外。
 * 胶囊来源为**正文实体匹配结果**（实时、不落库；按 `entityId` 去重、按首次出现排序，见
 * `usePlotBodyEntities`），无手动添加 / 删除入口；溢出时仅「＋N」占 1 槽（不溢出则全显），
 * 悬停「＋N」浮窗列出被收口的实体（复用实体域的 `EntityCardMorePopup`），
 * 胶囊带 `data-entity-id` 以支持悬停实体信息卡，着色统一走全局胶囊层
 * （`chip-pill.css` 形态 + `.chip-m-*` 模块基色 + `.chip-p-*` 预设分类色，与档案卡同口径）。 */
export function SceneCard({
  scene,
  active,
  layoutKey,
  bookId,
  bodyText,
  onSelect,
  onEditNode,
  charHover,
  onDeleteScene,
  readonly = false,
  line = null,
  onHoverStart,
  onLeave
}: SceneCardProps) {
  const { t } = useTranslation('plot')
  // 正文按段落拆行（派生摘要块级之间用 `\n` 分隔）；空行丢弃，仅用于卡片渲染。
  const bodyParagraphs = scene.description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
  // 只读模式不渲染编辑 / 删除入口（右栏剧情页签）：仍需两个回调入参以保证调用契约一致。
  const showActions = !readonly
  // 胶囊数据：正文实体匹配结果（去重），不读 / 不写库。
  const characters = usePlotBodyEntities(bookId, bodyText)
  const charListRef = useRef<HTMLDivElement>(null)
  // 胶囊容量（按壳内胶囊容器实测宽测量、限 2 行）；溢出时「＋N」占 1 槽，不溢出则全显。
  const capacity = useChipOverflow(charListRef, characters.length, layoutKey, {
    maxRows: 2,
    moreSelector: '.plot-char-more'
  })
  let visibleCount = Math.min(characters.length, capacity)
  if (characters.length - visibleCount > 0) {
    visibleCount = Math.max(0, Math.min(characters.length, capacity - 1))
  }
  const visibleCharacters = characters.slice(0, visibleCount)
  const hiddenCount = characters.length - visibleCount

  // 「＋N」浮窗开合：锚点胶囊 + 120ms 往返余量（与实体悬停卡同口径）。
  const {
    anchor: moreAnchor,
    open: openMore,
    cancelClose: cancelMoreClose,
    scheduleClose: scheduleCloseMore
  } = useOverflowPopup()
  // 被收口的实体：无溢出时不构建条目（避免多余分配）。
  const hiddenCharacters = characters.slice(visibleCount)
  const moreItems: EntityCardMoreItem[] =
    hiddenCount > 0
      ? hiddenCharacters.map((character) => ({
          peerId: character.entityId,
          label: character.name,
          chipClass: entityChipClass(character.type, character.presetKey)
        }))
      : []

  return (
    <div className="plot-scene-wrap">
      <EntityStyleCard
        className="plot-scene-card"
        active={active}
        readonly={readonly}
        cardProps={{
          onClick: () => onSelect(scene.id),
          onMouseEnter: (event) => onHoverStart?.(event.currentTarget, event.target as HTMLElement),
          onMouseLeave: onLeave
        }}
        head={
          <PlotSceneHeading
            title={plotSceneTitle(scene, t('unnamedScene'))}
            line={line}
            unnamedLine={t('unnamedLine')}
          />
        }
        actions={
          showActions ? (
            <>
              <IconButton
                size="sm"
                label={t('timeline.editTitle')}
                onClick={(event) => {
                  event.stopPropagation()
                  onEditNode(scene)
                }}
              >
                <PencilIcon width={14} />
              </IconButton>
              <IconButton
                size="sm"
                tone="danger"
                label={t('editor.deleteScene')}
                onClick={(event) => {
                  event.stopPropagation()
                  onDeleteScene(scene.id)
                }}
              >
                <TrashIcon />
              </IconButton>
            </>
          ) : undefined
        }
        description={
          bodyParagraphs.length > 0
            ? bodyParagraphs.map((paragraph, index) => (
                <p className="plot-scene-para" key={`para-${index}`}>
                  {paragraph}
                </p>
              ))
            : undefined
        }
        descriptionClassName="plot-scene-body"
        chips={
          characters.length > 0 ? (
            <>
              {visibleCharacters.map((character) => (
                <span
                  className={`plot-char-card chip-pill ${entityChipClass(
                    character.type,
                    character.presetKey
                  )}`}
                  key={character.entityId}
                  data-entity-id={character.entityId}
                >
                  <span className="plot-char-name">{character.name}</span>
                </span>
              ))}
              {hiddenCount > 0 ? (
                <span
                  className="plot-char-more chip-pill chip-pill--neutral"
                  onMouseEnter={(event) => {
                    // 收掉可能残留的实体悬停卡：从角色胶囊直接移到「＋N」时，useEntityHover 找不到
                    // data-entity-id 会提前 return、不安排隐藏，卡片会一直挂着。
                    charHover.close()
                    openMore(event.currentTarget)
                  }}
                  onMouseLeave={scheduleCloseMore}
                >
                  {t('timeline.moreCharacters', { n: hiddenCount })}
                </span>
              ) : null}
            </>
          ) : undefined
        }
        chipsRef={charListRef}
        chipsProps={{
          onMouseOver: charHover.onMouseOver,
          onMouseLeave: charHover.onMouseLeave
        }}
        popup={
          moreAnchor !== null && moreAnchor.isConnected && moreItems.length > 0 ? (
            <EntityCardMorePopup
              anchorEl={moreAnchor}
              items={moreItems}
              onPointerEnter={() => {
                cancelMoreClose()
                charHover.cancelHide()
              }}
              onPointerLeave={() => {
                scheduleCloseMore()
                charHover.onMouseLeave()
              }}
              // 浮窗内胶囊经 portal 渲染、事件不冒泡到胶囊容器：显式给锚点，
              // 详情卡锚在本条胶囊上（真元素，滚动 / 重定位有效）。
              onItemEnter={charHover.showFor}
              onItemLeave={charHover.onMouseLeave}
            />
          ) : undefined
        }
      />
    </div>
  )
}

export default SceneCard
