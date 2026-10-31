import { useTranslation } from 'react-i18next'
import DocTitleField from '../../../components/editor/DocTitleField'
import type { UseChapterNameResult } from './useChapterName'

/**
 * 章节编辑头标题行（`DocTitleField` 薄壳）：适配 `UseChapterNameResult`。
 *
 * - **普通章**：编号前缀「第X章」**恒显**（span，不可编辑，与卷行「卷X · 名」同构，
 *   名不取代编号）+ 空隙（容器 `gap`）+ 名段输入；
 * - **特殊章**：前段（`specialPrefix`，如「序章 / 番外」——**创建时已设置，只读**，
 *   span 展示同普通前缀形态）+ 空隙 + 名段输入（`title`，可编辑）。
 *
 * 落库字段直映射（title = 名段）；间距由行容器 `gap` 统一控制；
 * 失焦 / Enter 提交落库，Escape 还原（逻辑见 `useChapterName`）。
 * 特殊章 aria 与 `doc-title-prefix--special` 语义标记保留在本薄壳内。
 */
export default function DocTitleRow({
  chapterId,
  name
}: {
  /** 当前章节 id（null = 无选中；作为 input key 供切章时重建焦点态）。 */
  chapterId: number | null
  /** `useChapterName` 的编辑状态（前段只读 + 名段单输入）。 */
  name: UseChapterNameResult
}) {
  const { t } = useTranslation('chapters')
  const { onKeyDown } = name

  return (
    <DocTitleField
      rowKey={chapterId !== null ? `${chapterId}${name.isSpecial ? '-special' : ''}` : null}
      prefix={name.prefix}
      showPrefix={true}
      prefixAria={name.isSpecial ? t('titleRow.specialPrefixAria') : undefined}
      prefixClassName={name.isSpecial ? 'doc-title-prefix--special' : undefined}
      value={name.value}
      placeholder={name.placeholder}
      disabled={name.disabled}
      onChange={name.onChange}
      onCommit={name.commit}
      onKeyDown={onKeyDown}
      titleAria={name.isSpecial ? t('titleRow.specialNameAria') : t('titleRow.titleAria')}
    />
  )
}
