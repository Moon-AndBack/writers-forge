import { getDb } from './index'

/**
 * 历史软删数据清理（幂等）：伏笔 / 灵感回收站已下线，删除改为物理删除。
 *
 * `deleted_at` 列**保留**（不重建表，`diagnostics/expected.ts` 仍校验列存在），
 * 仅停止业务写入。老版本遗留的软删行在每次启动时物理清空，避免其永久不可见；
 * 清空后再次执行不命中任何行，天然幂等。事务失败回滚，不写一次性 settings 键。
 *
 * 时序：须在两表建表之后调用（`createForeshadowsSchema` / `createInspirationsSchema`），
 * 见 `database/index.ts`。
 */
export function purgeLegacyTrash(): void {
  const db = getDb()
  db.transaction((): void => {
    db.prepare('DELETE FROM foreshadows WHERE deleted_at IS NOT NULL').run()
    db.prepare('DELETE FROM inspirations WHERE deleted_at IS NOT NULL').run()
  })()
}
