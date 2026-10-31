import { useCallback, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { type ChapterRow, type RenameChapterPatch } from './chapterTree'
import { useChapterLabels } from './useChapterLabels'

/**
 * 编辑头章节名编辑（字段直映射；前段只读）。
 *
 * 命名规则（与后端 `renameChapter` 同口径，`title` 只存**名段**）：
 * - **普通章**（`kind='normal'`）：固定编号前缀「第{numberIndex}章」（span，不可编辑）+
 *   空隙（容器 `gap`）+ 可编辑名输入框；落库 `title = 名`（空名 = 空串）；
 * - **特殊章**（`kind='special'`）：**前段只读**（`specialPrefix`，如「序章 / 番外」，
 *   创建时已设置——span 展示，不可编辑）+ 空隙 + 可编辑名输入框（`title` 名段）；
 *   落库 `title = 名段`、`specialPrefix` **原样透传**（不提供编辑；后端仅特殊章生效）。
 *
 * 提交策略：**失焦 / Enter 提交**（Escape 还原），不做按键逐次写库——降低 IPC 频次，
 * 避免中文输入法组合期反复落库。特殊 / 普通由章行按钮设定（编辑头只按
 * `chapter.kind` 展示对应形态），本 hook 不提供双向切换。
 */

/** 章节名输入值同步 key 的分隔符（id + 章判别）。 */
const KEY_SEP = '\u0000'

export interface UseChapterNameOptions {
  /** 当前选中章节行；null = 无选中（输入禁用）。 */
  chapter: ChapterRow | null
  /** 落库：调用方交 `api.chapters.rename`。 */
  renameChapter: (id: number, patch: RenameChapterPatch) => void
}

export interface UseChapterNameResult {
  /** 名段受控值（普通 / 特殊章共用同一输入框；特殊章前段只读、不在此列）。 */
  value: string
  /** 前段：普通章 = 恒显的「第X章」编号前缀（前缀恒显，与卷行同构）；特殊章 = `specialPrefix`（如「序章」，只读展示）。 */
  prefix: string
  /** 名段占位：特殊章「请编辑」；普通章无（保持「第X章」纯净显示）。 */
  placeholder: string
  /** 是否特殊章（前段展示口径 / 占位提示分派）。 */
  isSpecial: boolean
  /** 无选中章节时禁用输入。 */
  disabled: boolean
  /** 名段输入 change。 */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  /** 失焦提交（Enter 亦复用）。 */
  commit: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

/** 名段回填：`title` 即名段。 */
function nameSegmentInitial(chapter: ChapterRow): string {
  return chapter.title
}

export function useChapterName({
  chapter,
  renameChapter
}: UseChapterNameOptions): UseChapterNameResult {
  const { t } = useTranslation('chapters')
  const labels = useChapterLabels()
  const isSpecial = chapter?.kind === 'special'
  // 章节 id 或章判别变化时重置输入值（React「prop 变化期调整 state」范式，
  // 不用 effect，规避 set-state-in-effect）。同一章的「名编辑」写回不重置，
  // 保留用户正在输入 / 刚提交的原文。
  const syncKey = chapter ? `${chapter.id}${KEY_SEP}${isSpecial}` : 'none'
  const initial = chapter ? nameSegmentInitial(chapter) : ''
  const [value, setValue] = useState(initial)
  const [syncedKey, setSyncedKey] = useState(syncKey)
  if (syncedKey !== syncKey) {
    setSyncedKey(syncKey)
    setValue(initial)
  }

  // 前段只读展示：普通章 = 恒显动态编号「第X章」（前缀恒显，与卷行同构，名不取代编号）；
  // 特殊章 = 创建时设置的前段（不可编辑）。
  const prefix = isSpecial
    ? (chapter?.specialPrefix ?? '')
    : labels.chapterPrefixLabel(chapter ?? { kind: 'normal', numberIndex: 0, title: '' })
  const placeholder = isSpecial ? t('namePlaceholder') : ''

  // 失焦 / Enter 落库：`title = 名段`（空串 = 无自定义名）；
  // 特殊章额外把 `specialPrefix` **原样透传**（只读不可变，保持创建时前段；后端仅特殊章生效）。
  // 与当前名段一致（trim 后比较）不写库。
  const commit = useCallback((): void => {
    if (!chapter) return
    const trimmed = value.trim()
    if (trimmed === chapter.title.trim()) return
    const patch: RenameChapterPatch = { title: trimmed }
    if (isSpecial) patch.specialPrefix = chapter.specialPrefix
    renameChapter(chapter.id, patch)
  }, [chapter, isSpecial, value, renameChapter])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setValue(chapter ? nameSegmentInitial(chapter) : '')
      }
    },
    [chapter, commit]
  )

  return {
    value,
    prefix,
    placeholder,
    isSpecial,
    disabled: chapter === null,
    onChange: (event) => setValue(event.target.value),
    commit,
    onKeyDown
  }
}
