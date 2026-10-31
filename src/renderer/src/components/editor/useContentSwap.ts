import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * 正文「内容整体更换」的淡入相位（章节 / 大纲共用，§9）。
 *
 * 背景（DOM 归属边界，改动前必须理解）：
 * - 两个编辑器的实例都跨章节 / 条目复用（`useEditor` 的 deps 为 `[]`），内容更新统一走
 *   `editor.commands.setContent(...)`；
 * - `.editor-scroll`（以及其中的 `.doc-body`）由 **React** 管理 → 可挂 `data-*`；
 *   `.ProseMirror` 及其段落由 **ProseMirror 命令式**管理 → **不得**挂动画（PM 会原地复用
 *   `<p>` 元素、只改文本节点，任何挂在段落上的动画都不会触发，且与输入冲突）。
 *
 * 动画重启手法（与 `writer-editor-doc.css` 的 `data-placeholder-phase` 一致）：
 * CSS 变量 / 属性值变化不会重启动画，但**换用同内容的别名 keyframes** 会——故本 hook 在
 * `0 / 1` 之间交替相位，调用处渲染 `data-swap-phase`，两档相位各绑定一档关键帧
 * （`wf-enter-fade` / `wf-enter-fade-alt`），相位翻转即重播淡入。
 */

/** 淡入相位：0 / 1 交替，各自绑定一档别名关键帧（见 writer-editor-doc.css）。 */
export type ContentSwapPhase = 0 | 1

export interface ContentSwap {
  /** 内容提交次数：0 = 尚未提交，1 = 首次提交（挂载初载），≥ 2 起每次更换递增。 */
  loadToken: number
  /** 正文被整体替换（`setContent`）后调用：递增计数并翻转相位，重播淡入。 */
  markContentSwapped: () => void
  /**
   * 淡入相位；`null` = 尚未发生过「更换」（首次挂载 / 初次载入），调用处不渲染
   * `data-swap-phase`，因此不淡入（避免与应用级进场叠加）。
   */
  swapPhase: ContentSwapPhase | null
}

/**
 * 正文内容更换的淡入相位。
 *
 * 调用约定：**紧接在 `setContent(...)` 之后、且不早于同批 setState** 调用
 * `markContentSwapped()`——放在同批 setState 之后可让 `flushSync` 一次性提交
 * （正文相位 + 字数 / 状态），只触发一次渲染。
 */
export function useContentSwap(): ContentSwap {
  const [loadToken, setLoadToken] = useState(0)

  const markContentSwapped = useCallback((): void => {
    // 为何 flushSync：正文 DOM 由 ProseMirror 命令式写入，而相位属性由 React 提交。
    // 若只 setState，这次较低优先级的更新会排进 Scheduler 的宏任务（MessageChannel），
    // 其间可能插入一帧绘制 → **新正文先以 opacity:1 闪一帧，随后才从 0 淡入**（可见闪烁）。
    // 强制同步提交把「相位属性 + 动画起点」压到正文写入的同一帧之前；配合
    // `animation-fill-mode: both`，该帧已是 opacity:0，不存在闪烁窗口。
    // 调用点均位于异步回调（IPC 返回 / 微任务），不在渲染或生命周期内，flushSync 合法。
    flushSync(() => setLoadToken((n) => n + 1))
  }, [])

  // 0 = 尚未提交；1 = 首次提交（挂载初载，与应用级进场同时发生，不淡入）；
  // ≥ 2 起按奇偶交替（2 → 0、3 → 1 …），保证相邻两次更换必定换用另一档关键帧。
  const swapPhase: ContentSwapPhase | null =
    loadToken >= 2 ? ((loadToken % 2) as ContentSwapPhase) : null

  return { loadToken, markContentSwapped, swapPhase }
}
