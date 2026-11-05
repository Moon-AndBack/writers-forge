import { getDb } from './index'
import { FORESHADOW_COLUMNS, type ForeshadowAnchorKind, type ForeshadowRow } from './foreshadows'
import {
  BODY_COLUMNS,
  OUTLINE_COLUMNS,
  RECOVER_COLUMNS,
  normalizeAnchor,
  pushAnchorSets,
  type AnchorColumnSet
} from './foreshadowsAnchor'

/**
 * 伏笔锚点的**清空写路径**（正文埋点 / 大纲埋点 / 回收点共用）。
 *
 * 拆出原因：`foreshadows.ts` 已达 §3 的 500 行上限；本模块与读路径 `foreshadowsQuery.ts`
 * 对称，只负责「槽位置空 + 回收态守卫」，不参与创建 / 更新 / 查询。
 *
 * 关键规则：伏笔一旦有回收点（`recover_anchor_kind !== 'none'`），两个**埋点槽位**都不可
 * 清空——回收记录需要对应的埋点位置，先移除回收位置（撤销回收）才能移除埋点；回收槽位
 * 自身不设此限制。
 */

/** 毫秒精度时间戳表达式，与 `foreshadows.ts` 写入口径一致。 */
const NOW = `strftime('%Y-%m-%d %H:%M:%f', 'now')`

/** `clearForeshadowBodyAnchor` / `clearForeshadowOutlineAnchor` 结果：已回收 / 不存在属可预期拒绝。 */
export type ClearForeshadowAnchorResult =
  { ok: true; row: ForeshadowRow } | { ok: false; reason: 'recovered' | 'notFound' }

/**
 * 清空指定锚点槽位：`kind` 置 `'none'`，其余锚点列按归一化的空锚点写入（id 列 `NULL`、
 * 序号 / 区间 `NULL`、摘录空串），并刷新 `updated_at`。
 *
 * `guardRecovered = true`（两个埋点槽位）时，若目标行有回收点则拒绝并以
 * `{ ok: false, reason: 'recovered' }` 返回；回收槽位传 `false`（撤销回收不受限）。
 * 不存在的行返回 `notFound`。
 */
function clearAnchorSlot(
  id: number,
  columns: AnchorColumnSet,
  guardRecovered: boolean
): ClearForeshadowAnchorResult {
  const db = getDb()
  return db.transaction((): ClearForeshadowAnchorResult => {
    const existing = db
      .prepare(
        `SELECT book_id AS bookId, recover_anchor_kind AS recoverAnchorKind
         FROM foreshadows WHERE id = ? AND deleted_at IS NULL`
      )
      .get(id) as { bookId: string; recoverAnchorKind: ForeshadowAnchorKind } | undefined
    if (!existing) return { ok: false, reason: 'notFound' }
    if (guardRecovered && existing.recoverAnchorKind !== 'none') {
      return { ok: false, reason: 'recovered' }
    }
    const sets: string[] = []
    const values: unknown[] = []
    // 空锚点无需书域校验，但仍复用同一套归一化，保证列值与 create / update 一致。
    pushAnchorSets(sets, values, columns, normalizeAnchor(db, existing.bookId, undefined))
    sets.push(`updated_at = ${NOW}`)
    db.prepare(`UPDATE foreshadows SET ${sets.join(', ')} WHERE id = ?`).run(...values, id)
    const row = db
      .prepare(`SELECT ${FORESHADOW_COLUMNS} FROM foreshadows WHERE id = ?`)
      .get(id) as ForeshadowRow
    return { ok: true, row }
  })()
}

/** 清空**正文埋点**（`body_*` → `'none'`）；已回收拒绝、不存在返回结构化失败。 */
export function clearForeshadowBodyAnchor(id: number): ClearForeshadowAnchorResult {
  return clearAnchorSlot(id, BODY_COLUMNS, true)
}

/** 清空**大纲埋点**（`outline_*` → `'none'`）；已回收拒绝、不存在返回结构化失败。 */
export function clearForeshadowOutlineAnchor(id: number): ClearForeshadowAnchorResult {
  return clearAnchorSlot(id, OUTLINE_COLUMNS, true)
}

/** 清空**回收点**（`recover_*` → `'none'`）；不存在 / 已软删返回 null。 */
export function clearForeshadowRecoverAnchor(id: number): ForeshadowRow | null {
  const result = clearAnchorSlot(id, RECOVER_COLUMNS, false)
  // 未开启 `guardRecovered`，失败只可能是 `notFound`，保持旧返回契约不变。
  return result.ok ? result.row : null
}
