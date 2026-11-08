/**
 * 回收站数据变更的**模块级通知**（软删除入口 → 回收站列表刷新）。
 *
 * 四类回收站（章节 / 大纲 / 伏笔 / 灵感）分散在不同组件树，且视图是条件挂载：
 * 关闭即卸载、再打开才重新加载。左栏删除成功后只刷新自己的树，与回收站之间
 * 没有共同父级可传 prop（逐层穿透约 8 个文件），故沿用项目已有的模块级 store
 * 范式（见 `chapters/proofreadHits.ts`）：删除入口广播一次「回收站数据已变」，
 * `useTrashData` 订阅后重新拉取。通知本身不携带数据，订阅方各自调用自己的 `load`。
 *
 * 不使用 React Context：跨组件树仍需逐层包 Provider，同样要穿透，且回收站与
 * 删除入口并非稳定的祖先 / 后代关系。
 */

/** 订阅者集合（同一时刻每个打开的回收站视图注册一个监听者）。 */
const listeners = new Set<() => void>()

/**
 * 广播「回收站数据已变」：**同步**遍历调用全部监听者。
 *
 * 仅供软删除成功的分支调用；回收站自身的还原 / 彻底删除 / 清空无需广播
 * （它们已在写操作后 `await reload()`，广播会造成重复请求）。
 */
export function notifyTrashChanged(): void {
  for (const listener of listeners) listener()
}

/** 订阅回收站变更；返回取消订阅函数（组件卸载 / `bookId` 变化时调用）。 */
export function subscribeTrashChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
