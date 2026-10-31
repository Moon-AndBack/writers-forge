/**
 * 分类选择器（共享组件，§9）。
 *
 * 数据源：主进程 `categories` 表行（`CategoryRow[]`，调用方经 `categories:list`
 * 拉取后传入——本组件受控展示，不自行发起 IPC，便于复用与测试）。
 *
 * 交互（用户拍板）：主分类 / 子分类两个下拉 + 「添加」按钮，已选以 chips 展示。
 * - 主分类下拉 = 当前频道官方一级分类 + 自定义分类（「我的分类」，与频道无关，始终可选）；
 * - 子分类下拉 = 所选主分类的二级；一级未选或该主无二级时禁用；
 * - 无频道且无自定义分类时，主分类下拉为空并禁用；
 * - 规则（由 `useBookForm` 兜底执行）：每主可多子、加主则禁其子、同主不混形态、不可重复；
 * - 分类名取 `categories.name`（中文原文，**不译项**，直接渲染）；
 * - 已选分类以 chips 展示，子显示「主-子」、主显示主名，可逐个移除。
 *
 * §8 合规：可点元素 hover 仅颜色 / 描边变化（无 transform）。
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Select, Tag } from '../ui'
import type { CategoryRow } from '../../../../main/database/categories'
import type { BookChannel } from '../../../../main/database/books'
import '../../styles/components/category-tree-picker.css'

export interface CategoryTreePickerProps {
  /** 全部分类行（官方 + 自定义，来自 `categories:list`） */
  categories: CategoryRow[]
  /** 已选分类 ID 集合（主 = 一级 ID，子 = 二级 ID，仍为扁平 number[]） */
  selectedIds: number[]
  /** 当前频道（来自基础字段；决定官方主分类列表内容） */
  channel: BookChannel | null
  /** 添加一个条目：`childId` 为 null 表示「主」形态 */
  onAdd: (parentId: number, childId: number | null) => void
  /** 移除一个已选分类（chips 关闭按钮） */
  onRemove: (id: number) => void
  /** 重新拉取分类数据（加载失败重试） */
  onReload: () => void
  /** 数据加载失败标记（展示错误行 + 重试） */
  loadError?: boolean
  /** 无障碍：已选分类区名称 */
  selectedAriaLabel: string
  /** 加载失败提示文案 */
  loadErrorText?: string
  /** 重试按钮文案 */
  retryText?: string
}

/** 本组件内部浏览态：记录「自频道切换以来选中的主 / 子」（切换频道即归位）。 */
interface PickerSelection {
  channel: BookChannel | null
  parentId: number | null
  childId: number | null
}

/**
 * 分类选择器：主分类下拉 + 子分类下拉 + 「添加」按钮 + 已选 chips。
 */
export function CategoryTreePicker({
  categories,
  selectedIds,
  channel,
  onAdd,
  onRemove,
  onReload,
  loadError = false,
  selectedAriaLabel,
  loadErrorText,
  retryText
}: CategoryTreePickerProps) {
  const { t } = useTranslation('bookshelf')

  /** 主分类候选：当前频道官方一级 + 自定义分类（「我的分类」，与频道无关，始终可选）。 */
  const parentRows = useMemo(
    () =>
      categories.filter(
        (row) =>
          row.parentId === null && ((!row.isCustom && row.channel === channel) || row.isCustom)
      ),
    [categories, channel]
  )

  /** 主分类 id → 其二级分类（保持后端排序）。 */
  const childrenByParent = useMemo(() => {
    const map = new Map<number, CategoryRow[]>()
    for (const row of categories) {
      if (row.parentId === null) continue
      const list = map.get(row.parentId)
      if (list) list.push(row)
      else map.set(row.parentId, [row])
    }
    return map
  }, [categories])

  const byId = useMemo(() => new Map(categories.map((row) => [row.id, row])), [categories])

  /** 已选集合与已选行（按 selectedIds 顺序；行缺失时跳过）。 */
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedRows = useMemo(
    () =>
      selectedIds.map((id) => byId.get(id)).filter((row): row is CategoryRow => row !== undefined),
    [selectedIds, byId]
  )

  /** 浏览态：切换频道即归位（渲染期回落 null，避免 effect 内 setState）。 */
  const [selection, setSelection] = useState<PickerSelection>({
    channel,
    parentId: null,
    childId: null
  })
  const active = selection.channel === channel ? selection : null
  const parentId = active?.parentId ?? null
  const childId = active?.childId ?? null

  const childRows = useMemo(
    () => (parentId !== null ? (childrenByParent.get(parentId) ?? []) : []),
    [childrenByParent, parentId]
  )

  /** 该主分类下是否已有子形态被选（用于「同主不混形态」判定）。 */
  const hasChildSelected = useMemo(
    () => parentId !== null && selectedRows.some((row) => row.parentId === parentId),
    [selectedRows, parentId]
  )

  /** 主分类选项：已以「主」形态加入者禁用（不可重复）。 */
  const parentOptions = useMemo(
    () =>
      parentRows.map((row) => ({
        value: String(row.id),
        label: row.name,
        disabled: selectedSet.has(row.id)
      })),
    [parentRows, selectedSet]
  )

  /** 子分类选项：主形态已选（加主禁其子）或该子已选（不可重复）时禁用。 */
  const childOptions = useMemo(
    () =>
      childRows.map((row) => ({
        value: String(row.id),
        label: row.name,
        disabled: parentId !== null && (selectedSet.has(parentId) || selectedSet.has(row.id))
      })),
    [childRows, parentId, selectedSet]
  )

  const childPlaceholder =
    parentId === null
      ? t('categoryTree.childNoParent')
      : childRows.length === 0
        ? t('categoryTree.noChildren')
        : t('categoryTree.childPlaceholder')

  /** 添加是否可用：主已选（主形态）则其子与本身均不可再加。 */
  const canAdd =
    parentId !== null &&
    (childId !== null
      ? !selectedSet.has(parentId) && !selectedSet.has(childId)
      : !selectedSet.has(parentId) && !hasChildSelected)

  const handleParentChange = (value: string): void => {
    setSelection({ channel, parentId: Number(value), childId: null })
  }

  const handleChildChange = (value: string): void => {
    setSelection({ channel, parentId, childId: Number(value) })
  }

  const handleAdd = (): void => {
    if (parentId === null || !canAdd) return
    onAdd(parentId, childId)
    setSelection({ channel, parentId, childId: null })
  }

  /** 已选行展示名：子 → 「主-子」，主 → 主名。 */
  const labelOf = (row: CategoryRow): string => {
    if (row.parentId === null) return row.name
    const parent = byId.get(row.parentId)
    return parent ? `${parent.name}-${row.name}` : row.name
  }

  return (
    <div className="ctp">
      {loadError ? (
        <div className="ctp-error">
          <span>{loadErrorText}</span>
          <button type="button" className="ctp-error__retry" onClick={onReload}>
            {retryText}
          </button>
        </div>
      ) : categories.length === 0 ? (
        <div className="ctp-loading">{t('categoryTree.loading')}</div>
      ) : (
        <div className="ctp-controls">
          <Select
            className="ctp-controls__field"
            ariaLabel={t('categoryTree.parentAria')}
            size="sm"
            placeholder={t('categoryTree.parentPlaceholder')}
            options={parentOptions}
            value={parentId !== null ? String(parentId) : undefined}
            onChange={handleParentChange}
            disabled={parentOptions.length === 0}
          />
          <Select
            className="ctp-controls__field"
            ariaLabel={t('categoryTree.childAria')}
            size="sm"
            placeholder={childPlaceholder}
            options={childOptions}
            value={childId !== null ? String(childId) : undefined}
            onChange={handleChildChange}
            disabled={parentId === null || childRows.length === 0}
          />
          <Button variant="secondary" size="sm" onClick={handleAdd} disabled={!canAdd}>
            {t('categoryTree.add')}
          </Button>
        </div>
      )}

      <div className="ctp-chips" role="group" aria-label={selectedAriaLabel}>
        {selectedRows.map((row) => (
          <Tag
            key={row.id}
            className={
              row.parentId === null
                ? 'chip-pill chip-pill--neutral chip-s2'
                : 'chip-pill chip-pill--neutral chip-s0'
            }
            tone={row.parentId === null ? 'brand' : 'neutral'}
            onClose={() => onRemove(row.id)}
          >
            {labelOf(row)}
          </Tag>
        ))}
      </div>
    </div>
  )
}

CategoryTreePicker.displayName = 'CategoryTreePicker'

export default CategoryTreePicker
