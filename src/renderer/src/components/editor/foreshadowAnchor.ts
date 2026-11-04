import type { ForeshadowAnchor } from '../../../../main/database/foreshadows'
import type { ParagraphAnchorInfo } from './paragraphAnchor'

/**
 * 选区快照 → 伏笔锚点（纯函数，无 React 依赖）。
 *
 * 从 `SelectionContextMenu` 抽出（§3 单文件 ≤500 行）：菜单的「添加伏笔 / 回收伏笔」
 * 与关联弹窗 hook（`useAttachForeshadow`）共用同一份构造逻辑，避免三处平行实现（§9）。
 *
 * 优先级：
 * - 传 `chapterId` → `kind: 'chapter'`（章 + 段落序号 + 段文本 + 段内字符区间）；
 * - 传 `outlineItemId` → `kind: 'outline'`（仅大纲**条目行**；卷纲 / 分组行不传）——
 *   同样写入 `paragraphIdx`（大纲正文是富文本，序号按顶层块计），否则正文标记无从定位；
 * - 两者皆无（如大纲的卷 / 分组目标）→ `kind: 'none'`（未锚定，正文标记批次不覆盖）。
 */
export function buildAnchor(
  info: ParagraphAnchorInfo,
  chapterId: number | null,
  outlineItemId: number | null
): ForeshadowAnchor {
  if (chapterId !== null) {
    return {
      kind: 'chapter',
      chapterId,
      paragraphIdx: info.paragraphIdx,
      quote: info.quote,
      charStart: info.charStart,
      charEnd: info.charEnd
    }
  }
  if (outlineItemId !== null) {
    return {
      kind: 'outline',
      outlineItemId,
      // 大纲正文是富文本：`paragraphIdx` 记**顶层块**序号（heading / list / paragraph 均按
      // doc 第 n 个子节点计），与章节同口径——正文标记据此定位，缺了它大纲伏笔永远不显示。
      paragraphIdx: info.paragraphIdx,
      quote: info.quote,
      charStart: info.charStart,
      charEnd: info.charEnd
    }
  }
  return { kind: 'none' }
}

export default buildAnchor
