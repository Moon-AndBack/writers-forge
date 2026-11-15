/**
 * 设定五域标题栏筛选行（非编辑态）：分类下拉 + 搜索框。
 *
 * 位置在标题栏动作组内、势力模块「卡片 / 架构」切换与「新建」加号之后
 * （顺序：视图切换（若有）｜ 加号 ｜ 分类下拉 + 搜索框）；
 * 由 `DossierActivityActions` 按富文本聚焦态切换——聚焦编辑时整行让位给
 * `RichTextToolbar`，离开正文后换回本行（没有单独「退出编辑」按钮）。
 *
 * 展示骨架与输入行为在通用行 `components/TitleBarFilterRow`（与伏笔 / 灵感共用）；
 * 本文件只负责注入本域的数据：
 * - 分类：选项来自 `useDossierSubtypes`（本书分类表），首项「全部分类」；境界体系
 *   （`MODULE_HAS_SUBTYPE = false`）不传 `select`，只保留搜索。分类在编辑弹窗里被删除后，
 *   当前值不在选项中即回落 `FILTER_ALL`（只在成功拉取后校验，避免瞬时空列表误清）。
 * - 搜索：名称 + 别名（`filterDossierRows` 口径）；切模块时本组件随 `DossierView`
 *   重挂载，各模块关键词互不影响。
 *
 * 下拉打开前调用 `subtypes.reload()`：标题栏常驻，分类表可能在编辑弹窗中已变更；
 * 刷新失败保留旧选项，不打断筛选。
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import TitleBarFilterRow from '../../../components/TitleBarFilterRow'
import type { TitleBarFilterSelect } from '../../../components/TitleBarFilterRow'
import { FILTER_ALL, useDossierFilters } from './dossierFilterContext'
import { MODULE_ENTITY_TYPE, MODULE_HAS_SUBTYPE } from './dossierTree'
import type { DossierModule } from './dossierTree'
import { useDossierSubtypes } from './useDossierSubtypes'

export interface DossierFilterRowProps {
  /** 当前设定域（决定分类来源与筛选桶）。 */
  module: DossierModule
}

export default function DossierFilterRow({ module }: DossierFilterRowProps) {
  const { t } = useTranslation('dossier')
  const { bookId, filters, setFilter } = useDossierFilters()
  const entry = filters[module]
  const hasSubtype = MODULE_HAS_SUBTYPE[module]
  const subtypes = useDossierSubtypes(bookId, hasSubtype ? MODULE_ENTITY_TYPE[module] : null)

  // 分类被删除后回落「全部分类」：只在成功拉取后校验；加载中 / 拉取失败不重置。
  useEffect(() => {
    if (!subtypes.loaded) return
    if (entry.subtype === FILTER_ALL) return
    if (subtypes.rows.some((row) => String(row.id) === entry.subtype)) return
    setFilter(module, { subtype: FILTER_ALL })
  }, [entry.subtype, module, setFilter, subtypes])

  const options = useMemo(
    () => [
      { value: FILTER_ALL, label: t('filter.allSubtypes') },
      ...subtypes.rows.map((row) => ({ value: String(row.id), label: row.name }))
    ],
    [subtypes.rows, t]
  )

  const commitQuery = useCallback(
    (next: string): void => {
      setFilter(module, { query: next })
    },
    [module, setFilter]
  )

  const select: TitleBarFilterSelect | undefined = hasSubtype
    ? {
        value: entry.subtype,
        options,
        ariaLabel: t('filter.subtypeAria'),
        onChange: (next) => setFilter(module, { subtype: next }),
        /** 下拉打开前刷新分类选项（pointerdown / 键盘打开都会先经过这里）。 */
        onOpen: () => {
          subtypes.reload()
        }
      }
    : undefined

  return (
    <TitleBarFilterRow
      select={select}
      query={entry.query}
      onQueryCommit={commitQuery}
      search={{ placeholder: t('filter.searchPlaceholder'), ariaLabel: t('filter.searchAria') }}
    />
  )
}
