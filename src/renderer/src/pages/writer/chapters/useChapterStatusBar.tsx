import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetModuleStatusBar } from '../../../shell/statusBarContext'
import { computeChapterPosition } from './chapterTree'
import type { ChapterRow, VolumeRow } from './chapterTree'
import CleanWordHitsPill from './CleanWordHitsPill'
import { useChapterLabels } from './useChapterLabels'

export interface UseChapterStatusBarOptions {
  /** 共享卷源（用于「普通卷」判定）。 */
  volumes: VolumeRow[]
  /** 章节树（用于统计普通章序号 / 总数）。 */
  chapters: ChapterRow[]
  /** 当前选中章 id（null = 未选中）。 */
  activeChapterId: number | null
}

/**
 * 章节模块状态栏：把「第X章 共Y章」+ 违禁词命中胶囊（0 处为静态文本）注册到状态栏
 * `left` 插槽（活动模块为「章节」时由外壳渲染，位于最左图钉右侧；切模块 / 卸载时自动清空）。
 *
 * 从 `Writer.tsx` 抽出，避免主页面逼近 500 行上限。注册口径对齐模块级插槽
 * （`useSetModuleStatusBar('chapters', ...)`）：外壳按当前活动模块选区，故此处
 * **不再**自行判断 `active === 'chapters'`。
 *
 * 显示口径（本环保持现有中文生成逻辑，编号本地化为下一环）：
 * - 普通章：「第X章 共Y章」（X / Y 均为中文数字，复用 toChineseNumber）；
 * - 特殊章（index=null）：隐藏序号，仅显示「共Y章」；
 * - 无选中章：`total` 为 0，仍显示「共零章」——保持原行为。
 * slots 以 useMemo 稳定引用，避免无意义的重注册循环（见 statusBarContext 注释）。
 *
 * 违禁词胶囊（`CleanWordHitsPill`）：计数订阅与命中清单弹层**全部下沉**到该组件，
 * 本 hook 只渲染节点、不订阅计数。否则计数变化会换掉 slots 引用，触发
 * `useSetModuleStatusBar` 先 cleanup 再重注册，状态栏每次计数 / 弹层开合都会瞬时空一段。
 */
export function useChapterStatusBar({
  volumes,
  chapters,
  activeChapterId
}: UseChapterStatusBarOptions): void {
  // 状态栏 title 文案（模块「章节」专属）。
  const { t } = useTranslation('writer')
  const labels = useChapterLabels()

  const position = useMemo(
    () => computeChapterPosition(volumes, chapters, activeChapterId),
    [volumes, chapters, activeChapterId]
  )

  const slots = useMemo(() => {
    return {
      left: (
        <>
          <span className="st-meta" title={t('chapterPositionTitle')}>
            {labels.statusBar(position.index, position.total)}
          </span>
          <CleanWordHitsPill />
        </>
      )
    }
  }, [position, labels, t])

  useSetModuleStatusBar('chapters', slots)
}
