/**
 * 实体首次登场位置行（设定档案卡 / 正文悬停卡共用）。
 *
 * 三种状态（调用方只需区分 `place`）：
 * - `undefined`：无数据（加载中或失败）——**不渲染**，避免出现空行后再跳变，
 *   也避免把加载失败说成「尚未登场」；
 * - `null`：匹配完成且正文中未出现——渲染弱化色的「尚未登场」；
 * - `FirstAppearancePlace`：渲染「卷X 卷名 · 第X章 章名」，tooltip 显示完整位置。
 *
 * 位置串由共享纯函数 `formatChapterPlace` 生成；编号数字词经 `useChapterLabels`
 * 按当前界面语言取（与章节页、伏笔卡同一口径），切换语言自动重算。
 */
import { useMemo } from 'react'
import { formatChapterPlace } from '../../../../../shared/place'
import type { PlaceLabels } from '../../../../../shared/place'
import type { FirstAppearancePlace } from '../../../../../preload/types/worldEntity'
import { PlaceLine } from '../../../components/ui'
import { useChapterLabels } from '../chapters/useChapterLabels'

/** 位置串只用到的章字段（与 `formatChapterPlace` 的标签函数签名对齐）。 */
interface PlaceChapter {
  kind: FirstAppearancePlace['chapterKind']
  numberIndex: number
  title: string
  specialPrefix: string | null
}

/** 位置串只用到的卷字段。 */
interface PlaceVolume {
  kind: FirstAppearancePlace['volumeKind']
  numberIndex: number
  title: string
}

export interface FirstAppearanceLineProps {
  /** 首次登场位置；`undefined` = 无数据（加载中 / 失败），组件不渲染。 */
  place: FirstAppearancePlace | null | undefined
  /** 左侧标签（由调用方按所属命名空间传入，如「首次登场」）。 */
  label: string
  /** 未登场文案（弱化色）。 */
  emptyLabel: string
}

/** 首次登场位置行：标签 + 位置串 / 弱化的「尚未登场」。 */
export function FirstAppearanceLine({ place, label, emptyLabel }: FirstAppearanceLineProps) {
  const labels = useChapterLabels()

  // 编号词跟随界面语言：`chapterPrefixLabel` 只接受前缀所需字段，特殊章走 `specialPrefix`。
  const placeLabels = useMemo<PlaceLabels<PlaceChapter, PlaceVolume>>(
    () => ({
      volumePrefixLabel: (volume) => labels.volumePrefixLabel(volume),
      chapterRowPrefixLabel: (chapter) =>
        chapter.kind === 'special'
          ? (chapter.specialPrefix ?? '')
          : labels.chapterPrefixLabel(chapter)
    }),
    [labels]
  )

  if (place === undefined) return null
  if (place === null) return <PlaceLine label={label} value={emptyLabel} tone="muted" />

  const chapter: PlaceChapter = {
    kind: place.chapterKind,
    numberIndex: place.chapterNumberIndex,
    title: place.chapterTitle,
    specialPrefix: place.specialPrefix
  }
  const volume: PlaceVolume = {
    kind: place.volumeKind,
    numberIndex: place.volumeNumberIndex,
    title: place.volumeTitle
  }

  return <PlaceLine label={label} value={formatChapterPlace(volume, chapter, placeLabels)} />
}

export default FirstAppearanceLine
