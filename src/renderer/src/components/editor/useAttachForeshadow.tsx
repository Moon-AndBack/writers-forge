import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Editor } from '@tiptap/core'
import type { ForeshadowAnchor } from '../../../../main/database/foreshadows'
import ForeshadowAnchorAttachDialog from '../dialogs/ForeshadowAnchorAttachDialog'
import type { AttachForeshadowFailureReason } from '../dialogs/ForeshadowAnchorAttachDialog'
import { buildAnchor } from './foreshadowAnchor'
import { resolveParagraphAnchor } from './paragraphAnchor'
import {
  notifyForeshadowMarksRefresh,
  refreshForeshadowMarks,
  type ForeshadowLabelResolver
} from './useForeshadowMarks'

/**
 * 正文右键「关联伏笔」的接线（从 `SelectionContextMenu` 抽出，§3 单文件 ≤500 行）：
 * 选区快照 → 打开关联弹窗 → 成功后 toast + 关闭 + 重拉正文标记。
 *
 * 菜单壳只负责声明菜单项，弹窗节点与状态都在本 hook 内，避免把第三个弹窗的
 * state / 回调继续堆进菜单组件（菜单已持有创建 / 回收两个弹窗）。
 */

/** 失败原因 → 提示文案 key（`invalid` / `notFound` / `error` 统一按通用失败提示）。 */
const FAILURE_MESSAGE_KEYS = {
  full: 'attach.full',
  invalid: 'attach.failed',
  notFound: 'attach.failed',
  error: 'attach.failed'
} as const satisfies Record<AttachForeshadowFailureReason, string>

export interface UseAttachForeshadowOptions {
  /** Tiptap 编辑器实例（取选区快照 + 成功后重拉标记）。 */
  editor: Editor | null
  /** 所属书籍 id（弹窗列出该书可挂的伏笔）。 */
  bookId: string
  /** 章节编辑器：当前章 id（大纲页不传）。 */
  chapterId: number | null
  /** 大纲编辑器：当前**条目行** id（卷 / 分组目标不传）。 */
  outlineItemId: number | null
  /** 正文标记的位置名解析（重拉标记时组悬停文案用）。 */
  resolveForeshadowTargetLabel?: ForeshadowLabelResolver
  /** 提示出口（toast 挂在菜单组件，弹窗卸载后仍可见）。 */
  showToast: (message: string) => void
}

export interface UseAttachForeshadowResult {
  /**
   * 取当前选区快照并打开关联弹窗；选区不可用（跨块 / 空选区）返回 false，
   * 由调用方决定提示（菜单接管条件已排除该分支，此处仅作防御）。
   */
  openAttach: () => boolean
  /** 待挂载的弹窗节点（无挂起锚点 → null）。 */
  dialog: ReactNode
}

export function useAttachForeshadow({
  editor,
  bookId,
  chapterId,
  outlineItemId,
  resolveForeshadowTargetLabel,
  showToast
}: UseAttachForeshadowOptions): UseAttachForeshadowResult {
  const { t } = useTranslation('foreshadow')
  /** 非 null = 关联弹窗打开（值 = 点菜单项时的选区快照）。 */
  const [anchor, setAnchor] = useState<ForeshadowAnchor | null>(null)

  const openAttach = useCallback((): boolean => {
    const info = editor ? resolveParagraphAnchor(editor) : null
    if (info === null) return false
    setAnchor(buildAnchor(info, chapterId, outlineItemId))
    return true
  }, [editor, chapterId, outlineItemId])

  const close = useCallback((): void => setAnchor(null), [])

  const handleAttached = useCallback((): void => {
    setAnchor(null)
    showToast(t('attach.success'))
    // 与「添加伏笔 / 回收伏笔」同一刷新口径：按当前锚点重拉并写回正文标记
    // （大纲埋点标记随即出现在选区处）。
    void refreshForeshadowMarks(editor, chapterId, outlineItemId, {
      resolveLabel: resolveForeshadowTargetLabel,
      t
    })
    // 广播：右栏总览等监听方重新拉取（与「添加 / 回收」同口径，先刷标记后广播）。
    notifyForeshadowMarksRefresh()
  }, [chapterId, editor, outlineItemId, resolveForeshadowTargetLabel, showToast, t])

  const handleFailed = useCallback(
    (reason: AttachForeshadowFailureReason): void => {
      showToast(t(FAILURE_MESSAGE_KEYS[reason]))
    },
    [showToast, t]
  )

  return {
    openAttach,
    dialog:
      anchor === null ? null : (
        <ForeshadowAnchorAttachDialog
          bookId={bookId}
          anchor={anchor}
          onClose={close}
          onAttached={handleAttached}
          onFailed={handleFailed}
        />
      )
  }
}

export default useAttachForeshadow
