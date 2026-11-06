import type { ActiveCleanWord } from '../../../../preload/types/cleanWords'

/**
 * 违禁词表（渲染进程内缓存 + 失效广播）。
 *
 * 分层：词表缓存与失效信号放共享层（`components/editor`），供
 * - 页面层扫描插件（`pages/writer/chapters/proofreadMark.ts`）读取并订阅重扫；
 * - 共享层词库动作 / 弹窗（`components/dialogs/**`）在词条增删改后触发失效。
 *
 * 缓存只保留一份 Promise（一次 IPC，扫描全程零 IPC）；失败置空以便下次重试。
 * `epoch` 每次失效自增，供扫描链路丢弃「失效前发起、失效后才返回」的旧快照。
 */

/** 词表缓存 Promise：成功即常驻；失败置空以便下次重试。 */
let activeWordsPromise: Promise<ActiveCleanWord[]> | null = null

/** 词表代次：每次失效自增，用于丢弃过期快照。 */
let wordsEpoch = 0

/** 失效订阅者（编辑器控制器注册重扫回调）。 */
const invalidateListeners = new Set<() => void>()

/** 取启用中的违禁词（**模块级缓存**，一次 IPC）。 */
export function loadActiveCleanWords(): Promise<ActiveCleanWord[]> {
  if (activeWordsPromise === null) {
    activeWordsPromise = window.api.cleanWords
      .active()
      .then((words) => words.filter((item) => item.word.trim() !== ''))
      .catch(() => {
        activeWordsPromise = null
        return []
      })
  }
  return activeWordsPromise
}

/** 读取当前词表代次（扫描链路据此判断快照是否已过期）。 */
export function getCleanWordsEpoch(): number {
  return wordsEpoch
}

/** 订阅词表失效（返回退订函数）。 */
export function onCleanWordsInvalidated(listener: () => void): () => void {
  invalidateListeners.add(listener)
  return () => {
    invalidateListeners.delete(listener)
  }
}

/**
 * 清除词表缓存并广播失效。
 *
 * 调用场景：词库被改动（导入 / 启用 / 禁用 / 删除）后。
 * 只清模块级 Promise 不够——各编辑器控制器的 `words` 快照也要清，否则已打开的编辑器
 * 会一直用旧词表扫描，用户看到的标记与词库不一致。控制器的重置与重扫由订阅方
 * （`proofreadMark` 的扫描插件）完成。
 */
export function resetActiveCleanWords(): void {
  activeWordsPromise = null
  wordsEpoch += 1
  for (const listener of invalidateListeners) listener()
}
