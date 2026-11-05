import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { SelectOption } from '../../../components/ui'
import { useStableMeasure } from '../../../components/useStableMeasure'
import type { VolumeRow } from '../chapters/chapterTree'
import { useChapterLabels } from '../chapters/useChapterLabels'
import { outlineItemLabel, type OutlineItemRow } from '../outline/outlineTree'
import Splitter from '../Splitter'
import OutlinePicker from './OutlinePicker'
import { useOutlinePreview } from './useOutlinePreview'

/**
 * 右栏主下拉的选中目标：条目（`outline_items` 行）或卷（正文卷 / 分组容器）。
 * `Select` 是扁平选项（无分组能力），故以 `entry:{id}` / `volume:{id}` 前缀编码区分大类。
 */
type PrimarySelection = { kind: 'entry' | 'volume'; id: number }

/** 编码下拉值（条目 / 卷混在一个下拉里）。 */
function encodeSelection({ kind, id }: PrimarySelection): string {
  return `${kind}:${id}`
}

/** 解析下拉值；非法 / 空串 → null（调用方回退默认选中）。 */
function parseSelection(value: string): PrimarySelection | null {
  const separator = value.indexOf(':')
  if (separator <= 0) return null
  const kind = value.slice(0, separator)
  const id = Number.parseInt(value.slice(separator + 1), 10)
  if (!Number.isInteger(id) || (kind !== 'entry' && kind !== 'volume')) return null
  return { kind, id }
}

/** `value` 是否仍是当前有效选项（数据刷新 / 删除后失效则回退默认）。 */
function hasOption(options: SelectOption[], value: string): boolean {
  return value !== '' && options.some((option) => option.value === value)
}

/** 上下两栏最小高度（px）：与 `.rp-outline__pane.rp-card` 的 min-height 同步。 */
const MIN_PANE_HEIGHT = 80
/** 水平分隔条高度（px）：与 `.splitter-horizontal` 同步，用于换算上下两栏可用高度。 */
const SPLITTER_SIZE = 8
/** `.rp-panel` 上下内衬合计（px）：`.rp-panel { padding: 8px }`（writer-right-panels.css）。 */
const PANEL_PADDING_Y = 8 * 2
/** 上下两栏默认比例：各占一半。 */
const DEFAULT_SPLIT_RATIO = 50

export interface OutlineRightPanelProps {
  /** 大纲页可见卷（`normal` + `group`，页面层与左栏同源）。 */
  volumes: VolumeRow[]
  /** 未删除大纲条目（`scope='entry'`，页面层与左栏同源）。 */
  items: OutlineItemRow[]
  /**
   * 当前正在编辑的卷 id（null = 当前编辑的不是卷）：
   * 章节模块 = 选中章所属卷；大纲模块 = 选中的正文卷（分组 / 条目不算卷）。
   */
  activeVolumeId?: number | null
}

/**
 * 章节模块右栏「大纲」页签：**一个主下拉 + 只读富文本展示**。
 *
 * - 主栏下拉**不带文字标签**，只列**独立条目**（`volumeId === null`）+ 所有卷 + 所有分组
 *   （选项文案带「独立条目 · / 卷 · / 分组 ·」前缀）：选条目 → 只有这一栏，正文占满剩余高度；
 * - 选卷或分组 → 主栏显示该卷 / 分组的卷纲，下方出现细纲栏（其下条目下拉 + 条目正文），
 *   上下默认各占一半，两栏之间的水平分隔条可拖动调节比例（每栏不小于 80px，
 *   双击恢复 50% / 50%）；分组在数据上也是 `volumes.kind='group'` 的一行，其"细纲"即
 *   `volumeId` 指向该分组 id 的条目，无条目时显示空态；
 * - **卷内 / 分组内条目不进主下拉**（否则同一条目会在主下拉与细纲里各出现一次），
 *   只在该卷 / 分组的细纲下拉里选；
 * - 默认选中优先级：**当前正在编辑的卷**（`activeVolumeId`，须在主下拉选项中）→ 第一条
 *   独立条目 → 第一个卷 / 分组 → 空；`activeVolumeId` 变化时下拉自动跟随，用户手动改选后
 *   在下一次卷变化前不被覆盖；
 * - 两个展示区都完全只读（无光标、无工具栏），正文在选中时按 id 现取
 *   （列表行的 `contentJson` 可能因中栏保存而过期，见 `useOutlinePreview`）；
 * - 数据只消费 props 的两个平铺集合（全部条目 / 全部卷）：下拉不需要树分层，
 *   故不再经 `buildOutlineTree` 归拢。
 */
export function OutlineRightPanel({
  volumes,
  items,
  activeVolumeId = null
}: OutlineRightPanelProps): ReactElement {
  const { t } = useTranslation('writer')
  const { t: tOutline } = useTranslation('outline')
  const labels = useChapterLabels()

  // 下拉值（受控）：'' = 尚未选择 / 选中项已失效（渲染期回退到默认项）。
  const [primaryValue, setPrimaryValue] = useState('')
  const [detailValue, setDetailValue] = useState('')
  // 「上次同步的当前编辑卷」：仅当它变化时把主下拉跟到新卷，用户手动改选不被无谓覆盖。
  const [syncedVolumeId, setSyncedVolumeId] = useState<number | null>(activeVolumeId)

  // 上下分栏：只存百分比比例（容器缩放时两栏同比例变化），不落库、切选中项不重置。
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [splitRatio, setSplitRatio] = useState(DEFAULT_SPLIT_RATIO)
  // 上下两栏可用高度（内容高 − 上下内衬 − 分隔条），用于把最小高度换算成百分比下限。
  // 复用 `useStableMeasure`：拖拽分隔条期间（`body.is-resizing`）只登记「结束后补测」，
  // 不在每帧读写布局——否则右栏宽度逐帧变化会形成「测量 → 写 state → 再布局」的逐帧自反馈；
  // 松手后由它的 rAF 补测链读到最终布局再写回。内衬是 `.rp-panel` 的常量 padding，
  // 直接用常量换算，省掉每帧一次 `getComputedStyle` 强制样式解析。
  const splitSpace = useStableMeasure(rootRef, true, (el) =>
    Math.max(0, el.clientHeight - PANEL_PADDING_Y - SPLITTER_SIZE)
  )

  // 条目 / 卷显示名（i18n）：条目空名回退占位；卷沿用章节域编号口径（分组走大纲卷名口径）。
  const entryLabel = useCallback(
    (item: OutlineItemRow): string => outlineItemLabel(item, tOutline('unnamedChapter')),
    [tOutline]
  )
  const volumeLabel = useCallback(
    (volume: VolumeRow): string =>
      volume.kind === 'group'
        ? labels.outlineVolumeLabel(volume, tOutline('unnamedGroup'))
        : labels.volumeLabel(volume),
    [labels, tOutline]
  )

  // 主下拉只列**独立条目**（`volumeId === null`）；卷内 / 分组内条目属于细纲，不进主下拉。
  const standaloneEntries = useMemo(() => items.filter((item) => item.volumeId === null), [items])

  // 主下拉：独立条目在前、卷 / 分组在后（默认选中优先级见下方 `defaultPrimaryValue`）。
  const options = useMemo<SelectOption[]>(
    () => [
      ...standaloneEntries.map((item) => ({
        value: encodeSelection({ kind: 'entry', id: item.id }),
        label: t('rightOutline.entryOption', { name: entryLabel(item) })
      })),
      ...volumes.map((volume) => ({
        value: encodeSelection({ kind: 'volume', id: volume.id }),
        label: t(
          volume.kind === 'group' ? 'rightOutline.groupOption' : 'rightOutline.volumeOption',
          { name: volumeLabel(volume) }
        )
      }))
    ],
    [standaloneEntries, volumes, t, entryLabel, volumeLabel]
  )

  // 当前编辑卷在主下拉中的编码值（不在选项里时由默认优先级兜底）。
  const activeVolumeOption =
    activeVolumeId === null ? null : encodeSelection({ kind: 'volume', id: activeVolumeId })

  // 默认选中优先级：当前编辑的卷 → 第一条独立条目 → 第一个卷 / 分组 → 空。
  const defaultPrimaryValue =
    activeVolumeOption !== null && hasOption(options, activeVolumeOption)
      ? activeVolumeOption
      : (options[0]?.value ?? '')

  // 当前编辑卷变化（如切到另一卷的章节）：主下拉跟随切到该卷；该卷不在选项中则回到默认优先级。
  // 渲染期条件 setState 是 React 官方的「根据 props 调整 state」模式，只在变化时触发一次。
  if (syncedVolumeId !== activeVolumeId) {
    setSyncedVolumeId(activeVolumeId)
    setPrimaryValue(
      activeVolumeOption !== null && hasOption(options, activeVolumeOption)
        ? activeVolumeOption
        : ''
    )
    // 切卷后不沿用上一卷的细纲选中（与手动切换主下拉的处理一致）。
    setDetailValue('')
  }

  const primaryResolved = hasOption(options, primaryValue) ? primaryValue : defaultPrimaryValue
  const selection = parseSelection(primaryResolved)
  const selectionKind = selection?.kind ?? null
  const selectionId = selection?.id ?? null
  const selectedVolumeId = selectionKind === 'volume' ? selectionId : null
  const selectedVolume = useMemo(
    () =>
      selectedVolumeId === null
        ? null
        : (volumes.find((row) => row.id === selectedVolumeId) ?? null),
    [volumes, selectedVolumeId]
  )
  // 分组在数据上也是卷（`volumes.kind='group'`）：显示规则与卷一致（两栏），仅文案区分。
  const selectedIsGroup = selectedVolume?.kind === 'group'
  const showDetail = selectionKind === 'volume'

  // 细纲下拉：选「卷 / 分组」时列出其下条目（按列表给定顺序）。
  const volumeEntries = useMemo(
    () =>
      selectedVolumeId === null ? [] : items.filter((item) => item.volumeId === selectedVolumeId),
    [items, selectedVolumeId]
  )
  const detailOptions = useMemo<SelectOption[]>(
    () => volumeEntries.map((item) => ({ value: String(item.id), label: entryLabel(item) })),
    [volumeEntries, entryLabel]
  )

  const detailResolved = hasOption(detailOptions, detailValue)
    ? detailValue
    : (detailOptions[0]?.value ?? '')
  const detailEntryId = detailResolved === '' ? null : Number.parseInt(detailResolved, 10)

  // 正文一律按 id 现取（列表副本可能陈旧）；竞态取消由 hook 内 key 判据兜住。
  const primaryPreview = useOutlinePreview({
    kind: selectionKind ?? 'entry',
    id: selectionId
  })
  const detailPreview = useOutlinePreview({ kind: 'entry', id: detailEntryId })

  // 切换主下拉即重置细纲选中（大类切换 / 换卷 / 换分组后不沿用上一条目）。
  const handlePrimaryChange = useCallback((next: string): void => {
    setPrimaryValue(next)
    setDetailValue('')
  }, [])
  const handleDetailChange = useCallback((next: string): void => {
    setDetailValue(next)
  }, [])

  // 主栏空态：无任何可浏览项（无独立条目且无卷 / 分组）→ 整体空态；否则按选中目标区分。
  const primaryEmptyText =
    selectionKind === null
      ? t('rightOutline.empty')
      : selectedIsGroup
        ? t('rightOutline.groupEmpty')
        : selectionKind === 'volume'
          ? t('rightOutline.volumeEmpty')
          : t('rightOutline.entryEmpty')
  const detailEmptyText =
    detailEntryId === null
      ? selectedIsGroup
        ? t('rightOutline.groupNoDetail')
        : t('rightOutline.noDetail')
      : t('rightOutline.entryEmpty')

  // 上下两栏最小高度换算成比例下限（容器过矮时放弃下限，交给 CSS 兜底）；
  // 渲染时再 clamp：容器缩小后不越下限，放大后回到用户拖出的比例。
  const minSplitRatio = splitSpace > MIN_PANE_HEIGHT * 2 ? (MIN_PANE_HEIGHT / splitSpace) * 100 : 0
  const maxSplitRatio = 100 - minSplitRatio
  const visibleSplitRatio = Math.min(maxSplitRatio, Math.max(minSplitRatio, splitRatio))

  return (
    <div className="rp-panel rp-outline" ref={rootRef}>
      <OutlinePicker
        ariaLabel={t('rightOutline.outlineLabel')}
        options={options}
        value={primaryResolved}
        onChange={handlePrimaryChange}
        preview={primaryPreview}
        emptyText={primaryEmptyText}
        // 单栏时回到 CSS 的 flex:1；双栏时按比例分配（flex-basis 为 0，grow 即占比）。
        style={showDetail ? { flexGrow: visibleSplitRatio } : undefined}
      />
      {showDetail ? (
        <>
          <Splitter
            orientation="horizontal"
            side="top"
            targetRef={rootRef}
            unit="percent"
            min={minSplitRatio}
            max={maxSplitRatio}
            value={visibleSplitRatio}
            defaultValue={DEFAULT_SPLIT_RATIO}
            onChange={setSplitRatio}
          />
          <OutlinePicker
            ariaLabel={t('rightOutline.detailLabel')}
            options={detailOptions}
            value={detailResolved}
            onChange={handleDetailChange}
            preview={detailPreview}
            emptyText={detailEmptyText}
            style={{ flexGrow: 100 - visibleSplitRatio }}
          />
        </>
      ) : null}
    </div>
  )
}

export default OutlineRightPanel
