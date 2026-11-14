/**
 * 活动栏「模块筛选」浮层（可筛选模块图标 hover 触发：灵感 + 伏笔）。
 *
 * 交互：鼠标移入模块图标 → 浮层贴活动栏右侧展开（`HoverPopupShell` 的 `right` 定位，
 * 固定态内缩 64px 由 `popoverGeometry` 统一处理）；移出按钮与浮层约 300ms 后收起
 * （计时器在 `activityBar.tsx`，本组件只管内容与「进入 / 离开」上报）。
 *
 * 内容只有两行（不做计数 / 提示 / 分隔线）：
 * - 第一行：模块名 + 搜索框 + 圆形提交按钮；
 * - 第二行：「全部」+ 该模块的全部分类（横向 chip，超出换行）。
 * 点击分类 = 写入该模块的筛选条件并切到该模块；点「全部」清除分类条件；
 * 搜索框只写关键词，点搜索按钮才切模块——避免打字就触发未保存改动确认。
 * 匹配结果本身在中栏网格看，浮层不再报数。
 *
 * 数据源适配（**不复制浮层**）：
 * - 灵感域：`useInspirationFilters` + 「内置预置 ∪ 已用标签」，分类 = 标签，
 *   搜索 = 标题 + 内容 + 标签；
 * - 伏笔域：`useForeshadowFilters`，分类 = 派生状态（建设中 / 埋设中 / 已回收 / 已废弃），
 *   搜索 = 名称 + 描述 + 回收备注 + 三处原文摘抄；
 * 两分支只在「条件 / 选项 / 写入方式」上不同，两行布局、搜索防抖、提交与切换守卫
 * 全部共用同一棵 JSX。
 *
 * 设定五域（世界观 / 角色 / 势力 / 境界体系 / 物品功法）**不再使用本浮层**：筛选入口
 * 已迁到标题栏筛选行（`DossierActivityActions` 注册的 `DossierFilterRow`），此处只服务
 * 灵感与伏笔。
 *
 * 收起保护：`onKeepOpen` 由活动栏提供，同时取消活动栏自身的收起计时与浮层计时；
 * 搜索框 `onFocus` 也调它，保证「Tab 聚焦输入框」不会因鼠标不在而收起。
 * 另外浮层根节点经 `shellRef` 回传活动栏，供 `focusin / focusout` 驱动同一「保持打开」状态。
 *
 * 搜索输入：本地受控 + 防抖 / IME / flush 由共享 `useFilterQueryDraft` 提供
 * （与标题栏筛选行同一实现），避免逐键触发 Provider → 中栏全量重渲染。
 */
import { useMemo } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/cn'
import { SearchInput } from '../components/ui'
import { SearchIcon } from '../components/icons'
import { HoverPopupShell } from '../components/HoverPopupShell'
import { useFilterQueryDraft } from '../components/useFilterQueryDraft'
import type { ForeshadowDisplayStatus } from '../../../shared/foreshadowStatus'
import {
  FORESHADOW_FILTER_STATUSES,
  useForeshadowFilters
} from '../pages/writer/foreshadow/foreshadowFilterContext'
import { FORESHADOW_STATUS_LABEL_KEYS } from '../pages/writer/foreshadow/foreshadowTree'
import { useInspirationFilters } from '../pages/writer/inspiration/inspirationFilterContext'
import { mergeInspirationTags } from '../pages/writer/inspiration/inspirationPresets'
import { useActivityBar } from './activityBarContext'
import { useModuleLabel } from './activityBarModules'
import type { FilterableModule } from './activityBarModules'
import { useRequestSwitch } from './unsavedSwitchGuard'

export interface ActivityBarFilterPopoverProps {
  /** 触发浮层的可筛选模块。 */
  module: FilterableModule
  /** 锚点图标元素（连通时按其最新视口矩形定位）。 */
  anchorEl: HTMLElement
  /** 锚点快照（元素断开时兜底）。 */
  anchorRect: DOMRect
  /** 浮层根节点回调 ref：活动栏据此判断焦点 / 指针是否仍在浮层内。 */
  shellRef: (node: HTMLDivElement | null) => void
  /** 指针 / 焦点进入浮层：置「保持打开」并取消活动栏与浮层的收起计时。 */
  onKeepOpen: () => void
  /** 指针离开浮层：附带事件，供活动栏按 `relatedTarget` 判断是否仍在 hover 区域。 */
  onLeave: (event: ReactMouseEvent<HTMLDivElement>) => void
  /** 主动关闭浮层：选择分类 / 提交搜索后由活动栏收起浮层并交还焦点。 */
  onClose: () => void
}

export default function ActivityBarFilterPopover({
  module,
  anchorEl,
  anchorRect,
  shellRef,
  onKeepOpen,
  onLeave,
  onClose
}: ActivityBarFilterPopoverProps) {
  const { t: tInspiration } = useTranslation('inspiration')
  const { t: tForeshadow } = useTranslation('foreshadow')
  const {
    bookId,
    filters: inspirationFilters,
    setFilter: setInspirationFilter,
    tags: inspirationTags
  } = useInspirationFilters()
  const { filters: foreshadowFilters, setFilter: setForeshadowFilter } =
    useForeshadowFilters(bookId)
  const { active } = useActivityBar()
  // 模块切换统一经守卫：有未保存草稿时由写作页弹「保存并切换 / 放弃并切换」。
  const requestSwitch = useRequestSwitch()
  const moduleLabel = useModuleLabel(module)

  const isInspiration = module === 'inspiration'
  const entryQuery = isInspiration ? inspirationFilters.query : foreshadowFilters.query
  const activeValue: string | null = isInspiration
    ? inspirationFilters.tag
    : foreshadowFilters.status

  const allLabel = isInspiration ? tInspiration('filter.all') : tForeshadow('filter.all')
  const copy = isInspiration
    ? {
        searchPlaceholder: tInspiration('filter.searchPlaceholder'),
        searchAria: tInspiration('filter.searchAria'),
        search: tInspiration('filter.search'),
        listAria: tInspiration('filter.tagAria')
      }
    : {
        searchPlaceholder: tForeshadow('filter.searchPlaceholder'),
        searchAria: tForeshadow('filter.searchAria'),
        search: tForeshadow('filter.search'),
        listAria: tForeshadow('filter.statusAria')
      }

  // 写入本实例所属模块的关键词（切换模块时浮层按 module 重挂载，不会串模块）。
  const commitQuery = (value: string): void => {
    if (isInspiration) setInspirationFilter({ query: value })
    else setForeshadowFilter({ query: value })
  }
  const draft = useFilterQueryDraft(entryQuery, commitQuery)

  // 「全部」恒在；灵感分支追加「预设 ∪ 已用标签」，伏笔分支按派生状态固定顺序追加四个状态。
  const options = useMemo<Array<{ value: string | null; label: string }>>(() => {
    if (isInspiration) {
      return [
        { value: null, label: allLabel },
        ...mergeInspirationTags(inspirationTags).map((tag) => ({ value: tag, label: tag }))
      ]
    }
    return [
      { value: null, label: allLabel },
      ...FORESHADOW_FILTER_STATUSES.map((status) => ({
        value: status,
        label: tForeshadow(FORESHADOW_STATUS_LABEL_KEYS[status])
      }))
    ]
  }, [allLabel, inspirationTags, isInspiration, tForeshadow])

  const isCurrentModule = active === module

  /** 应用分类筛选并切到该模块（切换走模块切换守卫，保留未保存改动确认）。 */
  const handlePick = (value: string | null): void => {
    // 筛选条件先写入（立即生效，不受守卫影响），模块切换交给守卫裁决。
    if (isInspiration) {
      setInspirationFilter({ tag: value })
    } else {
      setForeshadowFilter({ status: value === null ? null : (value as ForeshadowDisplayStatus) })
    }
    requestSwitch(module)
    onClose()
  }

  /**
   * 空关键词且浮层模块就是当前模块时没有可提交的内容（禁用按钮）；
   * 其余情况（有关键词，或要切到别的模块）都允许点，切换仍受未保存守卫约束。
   */
  const canSubmitSearch = draft.value.trim().length > 0 || !isCurrentModule

  /** 搜索按钮：先 flush 防抖窗口内的关键词，再切到该模块让关键词生效。 */
  const handleSearchSubmit = (): void => {
    draft.flush()
    requestSwitch(module)
    onClose()
  }

  return (
    <HoverPopupShell
      anchorRect={anchorRect}
      anchorEl={anchorEl}
      placement="right"
      className="act-filter"
      role="group"
      contentKey={options}
      elementRef={shellRef}
      onPointerEnter={onKeepOpen}
      onPointerLeave={onLeave}
    >
      {/* 第一行：模块名 + 搜索框 + 圆形提交按钮（按钮先把关键词落进 Context，再切到该模块）。 */}
      <div className="act-filter__headrow">
        <div className="act-filter__head">{moduleLabel}</div>
        <SearchInput
          className="act-filter__search"
          showIcon={false}
          value={draft.value}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchAria}
          autoComplete="off"
          spellCheck={false}
          onChange={draft.onChange}
          onCompositionStart={draft.onCompositionStart}
          onCompositionEnd={draft.onCompositionEnd}
          onKeyDown={draft.onKeyDown}
          onBlur={draft.onBlur}
          onClear={draft.onClear}
          onFocus={onKeepOpen}
        />
        <button
          type="button"
          className="act-filter__search-btn"
          aria-label={copy.search}
          title={copy.search}
          disabled={!canSubmitSearch}
          onClick={handleSearchSubmit}
        >
          <SearchIcon />
        </button>
      </div>
      {/* 第二行：「全部」+ 该模块的全部分类（无分类时只剩「全部」，属自然状态）。 */}
      <div className="act-filter__list" role="group" aria-label={copy.listAria}>
        {options.map((option) => {
          const selected = activeValue === option.value
          return (
            <button
              key={option.value ?? '__all__'}
              type="button"
              className={cn('act-filter__item', selected && 'is-active')}
              aria-pressed={selected}
              onClick={() => handlePick(option.value)}
            >
              <span className="act-filter__item-label">{option.label}</span>
            </button>
          )
        })}
      </div>
    </HoverPopupShell>
  )
}
