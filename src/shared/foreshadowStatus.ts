/**
 * 伏笔**展示状态派生**（跨进程共享：主进程 / 渲染层共用，AGENTS §2）。
 *
 * 本文件只允许**类型 + 纯函数**，不得引入 `better-sqlite3` 等 Node 专有模块——
 * 渲染层会直接打包它（放主进程目录会牵连数据库依赖链，见 electron-vite 产物约束）。
 *
 * 状态由锚点与废弃标记自动派生，**不再由用户手动选择**：
 * 1. 有回收点（`recoverAnchorKind !== 'none'`）→ `recovered`（最高优先级，不可废弃）；
 * 2. `status = 'abandoned'`（落库的废弃标记）→ `abandoned`（可恢复，见 setForeshadowAbandoned）；
 * 3. 有正文埋点或大纲埋点（任一）→ `planted`（埋设中）；
 * 4. 以上都没有 → `drafting`（建设中）。
 *
 * 遗留值处理：老数据可能仍有 `status = 'recovered'`（旧三态时代的写入）。本函数**不读**
 * 该值判「已回收」——回收一律以 `recoverAnchorKind` 为准。因此遗留行：
 * - 有回收点 → 命中规则 1，派生为 `recovered`；
 * - 无回收点 → 落到规则 2~4，按锚点派生为 `abandoned` / `planted` / `drafting`。
 */

/** 展示用状态：由锚点与废弃标记派生，不可手动设置。 */
export type ForeshadowDisplayStatus = 'drafting' | 'planted' | 'recovered' | 'abandoned'

/**
 * 派生所需的行结构（结构化子集）。
 *
 * 刻意不 import 主进程的 `ForeshadowRow`（共享层不得反向依赖数据层实现）：
 * `ForeshadowRow` 天然满足本接口，调用方直接传整行即可。
 */
export interface ForeshadowStatusSource {
  /** 落库的废弃标记：仅 `'abandoned'` 有意义，其余均视为未废弃。 */
  status: 'planted' | 'recovered' | 'abandoned'
  /** 回收点锚点类型；`'none'` = 尚未回收。 */
  recoverAnchorKind: 'chapter' | 'outline' | 'none'
  /** 正文埋点类型；`'chapter'` = 已埋。 */
  bodyKind: 'chapter' | 'none'
  /** 大纲埋点类型；`'outline'` = 已埋。 */
  outlineKind: 'outline' | 'none'
}

/**
 * 派生展示状态（见文件头的优先级）。
 *
 * 入参只读取 `status` / `recoverAnchorKind` / `bodyKind` / `outlineKind` 四个字段。
 */
export function deriveForeshadowStatus(row: ForeshadowStatusSource): ForeshadowDisplayStatus {
  if (row.recoverAnchorKind !== 'none') return 'recovered'
  if (row.status === 'abandoned') return 'abandoned'
  if (row.bodyKind === 'chapter' || row.outlineKind === 'outline') return 'planted'
  return 'drafting'
}
