import { useSyncExternalStore } from 'react'

/* ---------- 弹窗开关 ----------
   两个入口（标题栏按钮 / 状态栏胶囊）分属不同组件树；本弹窗是唯一消费者，故用模块级
   订阅（`useSyncExternalStore`，同 `proofreadMark` 的计数范式）而非提升到页面级 state。
   `CleanWordsDialog` 仍从原路径 re-export 这两个符号，消费点无需改动。 */

let dialogOpen = false
const dialogListeners = new Set<() => void>()

function subscribeDialog(listener: () => void): () => void {
  dialogListeners.add(listener)
  return () => {
    dialogListeners.delete(listener)
  }
}

function getDialogOpen(): boolean {
  return dialogOpen
}

/** 打开 / 关闭违禁词库弹窗（标题栏与状态栏两处入口共用）。 */
export function setCleanWordsDialogOpen(open: boolean): void {
  if (dialogOpen === open) return
  dialogOpen = open
  for (const listener of dialogListeners) listener()
}

/** 订阅弹窗开关状态（入口按钮激活态 / 状态栏胶囊 `is-open` 复用）。 */
export function useCleanWordsDialogOpen(): boolean {
  return useSyncExternalStore(subscribeDialog, getDialogOpen, getDialogOpen)
}
