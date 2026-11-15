/**
 * 标题栏筛选行（通用骨架）：分类下拉（可选）+ 搜索框。
 *
 * 位置在标题栏动作组内、模块「新建」加号之后（顺序：视图切换（若有）｜ 加号 ｜ 筛选行）。
 * 设定档案五域、伏笔、灵感三处共用本组件，差异只在「选项来源 / 写入哪份筛选条件」——
 * 各域用一层薄包装注入（`DossierFilterRow` / `ForeshadowFilterRow` /
 * `InspirationFilterRow`），本文件只承接展示骨架与输入行为。
 *
 * 内部承接：
 * - 下拉：受控 `Select`；`onOpen` 在 pointerdown / 键盘打开前调用，供调用方刷新选项
 *   （如设定档案的分类表可能在编辑弹窗中变更）；`select` 不传（境界体系）则只渲染搜索框；
 * - 搜索：草稿 / 防抖 / IME / flush 由共享 `useFilterQueryDraft` 提供，避免逐键写筛选
 *   Context 触发中栏全量重渲染。
 *
 * 类名 `.tb-filter-row` / `__select` / `__search`（尺寸见 `styles/titlebar.css` 的 28px 档）。
 */
import { SearchInput, Select } from './ui'
import type { SelectOption } from './ui'
import { useFilterQueryDraft } from './useFilterQueryDraft'

/** 分类下拉配置（不传则不渲染：境界体系只有搜索）。 */
export interface TitleBarFilterSelect {
  /** 当前值（字符串枚举；调用方自行映射 `null` 等域内空值）。 */
  value: string
  options: SelectOption[]
  ariaLabel: string
  onChange: (next: string) => void
  /** 下拉打开前刷新选项（pointerdown / 键盘打开都会先经过这里）。 */
  onOpen?: () => void
}

export interface TitleBarFilterRowProps {
  /** 分类下拉；`undefined` = 只渲染搜索框。 */
  select?: TitleBarFilterSelect
  /** 筛选条件里的关键词（外部真源）。 */
  query: string
  /** 提交关键词（写入所属域的筛选条件）。 */
  onQueryCommit: (next: string) => void
  /** 搜索框文案。 */
  search: { placeholder: string; ariaLabel: string }
}

/** 会打开分类下拉的按键（Enter / Space / 方向键由 Select 触发器处理）。 */
const OPEN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp'])

export default function TitleBarFilterRow({
  select,
  query,
  onQueryCommit,
  search
}: TitleBarFilterRowProps) {
  const draft = useFilterQueryDraft(query, onQueryCommit)

  return (
    <div className="tb-filter-row">
      {select === undefined ? null : (
        <span
          className="tb-filter-row__select"
          onPointerDown={select.onOpen}
          onKeyDown={(event) => {
            if (OPEN_KEYS.has(event.key)) select.onOpen?.()
          }}
        >
          <Select
            size="sm"
            value={select.value}
            options={select.options}
            ariaLabel={select.ariaLabel}
            onChange={select.onChange}
          />
        </span>
      )}
      <SearchInput
        className="tb-filter-row__search"
        value={draft.value}
        placeholder={search.placeholder}
        aria-label={search.ariaLabel}
        autoComplete="off"
        spellCheck={false}
        onChange={draft.onChange}
        onCompositionStart={draft.onCompositionStart}
        onCompositionEnd={draft.onCompositionEnd}
        onKeyDown={draft.onKeyDown}
        onBlur={draft.onBlur}
        onClear={draft.onClear}
      />
    </div>
  )
}
