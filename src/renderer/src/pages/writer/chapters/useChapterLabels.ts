/**
 * 绑定界面语言的卷 / 章编号标签 hook。
 *
 * 内部以 `useTranslation('chapters')` 拿 `t` 与 `i18n`（`languageChanged` 时触发
 * 重渲染），经 `resolveLocale(i18n.language)` 规整语言，`useMemo` 构造一组绑定
 * 当前语言的标签函数：数字词由 `numberWord`（`./numberWords`）按语言生成，
 * 模板取 `chapters:numbering.*`。消费方把返回的函数按原纯函数签名透传使用即可
 * （模板中文形态如「第…章」仅作回退兜底，正常路径走 i18n）。
 */
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveLocale } from '../../../i18n/config'
import { numberWord } from './numberWords'
import {
  chapterLabel,
  chapterPrefixLabel,
  chapterRowPrefixLabel,
  volumeLabel,
  volumePrefixLabel
} from './chapterTree'
import type { ChapterNumberFormat, ChapterRow, VolumeRow } from './chapterTree'

/** 绑定当前界面语言的卷 / 章编号标签函数集合。 */
export interface ChapterLabels {
  /** 普通章编号前缀（`chapterPrefixLabel` 的语言绑定版）。 */
  chapterPrefixLabel: (chapter: Pick<ChapterRow, 'kind' | 'numberIndex' | 'title'>) => string
  /** 章行前段（`chapterRowPrefixLabel` 的语言绑定版）。 */
  chapterRowPrefixLabel: (chapter: ChapterRow) => string
  /** 章整串显示名（`chapterLabel` 的语言绑定版）。 */
  chapterLabel: (chapter: ChapterRow) => string
  /** 卷行前缀段（`volumePrefixLabel` 的语言绑定版，仅正文卷非空）。 */
  volumePrefixLabel: (volume: Pick<VolumeRow, 'kind' | 'numberIndex'>) => string
  /** 卷整串显示名（`volumeLabel` 的语言绑定版）。 */
  volumeLabel: (volume: Pick<VolumeRow, 'kind' | 'numberIndex' | 'title'>) => string
  /** 大纲卷名：`title` 空 → `emptyLabel`；否则原文（大纲侧卷名为纯名段，无编号前缀）。 */
  outlineVolumeLabel: (volume: { title: string }, emptyLabel: string) => string
  /** 状态栏「第X章 共Y章」/「共Y章」（index=null 时）。 */
  statusBar: (index: number | null, total: number) => string
}

/** 卷 / 章编号标签（绑定当前界面语言；语言切换自动失效重算）。 */
export function useChapterLabels(): ChapterLabels {
  const { t, i18n } = useTranslation('chapters')
  const locale = resolveLocale(i18n.language)

  return useMemo(() => {
    const format: ChapterNumberFormat = {
      chapterPrefix: (n: number) => t('numbering.chapterPrefix', { n: numberWord(n, locale) }),
      volumePrefix: (n: number) => t('numbering.volumePrefix', { n: numberWord(n, locale) })
    }

    return {
      chapterPrefixLabel: (chapter) => chapterPrefixLabel(chapter, format),
      chapterRowPrefixLabel: (chapter) => chapterRowPrefixLabel(chapter, format),
      chapterLabel: (chapter) => chapterLabel(chapter, format),
      volumePrefixLabel: (volume) => volumePrefixLabel(volume, format),
      volumeLabel: (volume) => volumeLabel(volume, format),
      outlineVolumeLabel: (volume, emptyLabel) => (volume.title === '' ? emptyLabel : volume.title),
      statusBar: (index: number | null, total: number) =>
        index === null
          ? t('numbering.statusTotal', { total: numberWord(total, locale) })
          : t('numbering.statusPosition', {
              index: numberWord(index, locale),
              total: numberWord(total, locale)
            })
    }
  }, [t, locale])
}
