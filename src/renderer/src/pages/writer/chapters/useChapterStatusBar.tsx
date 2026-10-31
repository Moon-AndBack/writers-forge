import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSetModuleStatusBar } from '../../../shell/statusBarContext'
import {
  setCleanWordsDialogOpen,
  useCleanWordsDialogOpen
} from '../../../components/dialogs/cleanWordsDialogStore'
import { computeChapterPosition } from './chapterTree'
import type { ChapterRow, VolumeRow } from './chapterTree'
import { useChapterLabels } from './useChapterLabels'
import { useProofreadHitCount } from './proofreadMark'

export interface UseChapterStatusBarOptions {
  /** 共享卷源（用于「普通卷」判定）。 */
  volumes: VolumeRow[]
  /** 章节树（用于统计普通章序号 / 总数）。 */
  chapters: ChapterRow[]
  /** 当前选中章 id（null = 未选中）。 */
  activeChapterId: number | null
}

/**
 * 章节模块状态栏：把「第X章 共Y章」+（有命中时的）违禁词处数注册到状态栏 `left` 插槽
 * （活动模块为「章节」时由外壳渲染，位于最左图钉右侧；切模块 / 卸载时自动清空）。
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
 * 违禁词计数（本批新增）：
 * - 只读订阅 `proofreadMark` 的模块级计数（章节正文编辑器扫描后发布，见 proofreadMark.ts），
 *   **本 hook 不发起任何扫描 / IPC**；
 * - **0 处不渲染**（不占位、不出胶囊），避免常驻噪音；
 * - 放 `left` 而非 `right`：`right` 由外壳全局排版 / 缩放控件占用（`App.tsx` 传入的
 *   children，遇 `right != null` 直接不渲染外壳控件），占位会打掉全局排版入口；
 * - **可点入口**（`.st-pill-btn`）：点击打开「违禁词库」弹窗，与标题栏按钮共用
 *   `CleanWordsDialog` 的模块级开关（`setCleanWordsDialogOpen` / `useCleanWordsDialogOpen`）；
 *   弹窗本体由章节视图内的 `ChapterActivityActions` 挂载（Modal portal 到 body，
 *   与本 hook 所在组件树无关）。`is-open` 与 `aria-pressed` 同步弹窗开启态。
 */
export function useChapterStatusBar({
  volumes,
  chapters,
  activeChapterId
}: UseChapterStatusBarOptions): void {
  // 状态栏 title 文案（模块「章节」专属）。
  const { t } = useTranslation('writer')
  // 违禁词计数文案在「章节」ns（模块专属），跨 ns 单独取一次 t，不拼前缀。
  const { t: tChapters } = useTranslation('chapters')
  const labels = useChapterLabels()
  const hitCount = useProofreadHitCount()
  const cleanWordsOpen = useCleanWordsDialogOpen()

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
          {hitCount > 0 && (
            <button
              type="button"
              className={`st-pill-btn wf-clean-count${cleanWordsOpen ? ' is-open' : ''}`}
              style={{ color: 'var(--danger)' }}
              title={tChapters('proofread.hitsTitle')}
              aria-label={tChapters('cleanWords.statusBarAria', { hits: hitCount })}
              aria-pressed={cleanWordsOpen}
              onClick={() => setCleanWordsDialogOpen(true)}
            >
              {tChapters('proofread.hits', { count: hitCount })}
            </button>
          )}
        </>
      )
    }
  }, [position, labels, t, tChapters, hitCount, cleanWordsOpen])

  useSetModuleStatusBar('chapters', slots)
}
