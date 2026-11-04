import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ForeshadowAnchorHit } from '../../../../../main/database/foreshadowsQuery'

/**
 * 删除章节 / 大纲条目时的「双埋点伏笔」影响提示（章节页与大纲页共用，§9 唯一实现）。
 *
 * 背景：
 * - **软删除**（章节树 / 大纲树垃圾桶 → 回收站）只置 `deleted_at`，`foreshadows` 行仍在；
 *   但列表页 / 正文标记按「目标是否仍在未删除列表」判定，故该处埋设点会显示为
 *   「锚点已失效」，伏笔本身与另一处埋设点仍保留。
 * - **彻底删除**（回收站垃圾桶 / 清空）是物理 `DELETE`，`foreshadows` 的外键
 *   `ON DELETE CASCADE` 会**整条删除**伏笔（包括另一处有效埋设点）。
 *
 * 本 hook 只负责「查 + 拼提示」，弹框仍复用调用方现有的删除确认框（不叠加第二层弹窗）；
 * 查询失败按「无提示」处理，绝不阻断删除流程。
 */

/** 删除类型：软删（进回收站）/ 彻底删除（物理删，伏笔随外键级联删除）。 */
export type ForeshadowDeleteMode = 'trash' | 'purge'

/** 删除目标：章节 id 或大纲条目 id（二选一，章节优先与 IPC 口径一致）。 */
export interface ForeshadowDeleteTarget {
  chapterId?: number
  outlineItemId?: number
}

/** 命中的槽位之外，另一个槽位是否也挂着锚点（= 双埋点伏笔）。 */
function hasSecondAnchor(hit: ForeshadowAnchorHit): boolean {
  const other = hit.slot === 'body' ? hit.row.outlineKind : hit.row.bodyKind
  return other !== 'none'
}

/**
 * 查询删除目标上的双埋点伏笔，返回确认框追加提示；无命中 / 查询失败 → null。
 *
 * 用 `listByAnchorHit`（正文 / 大纲埋点分别匹配并回传槽位）而非 `listByAnchor`
 * （兼容通道）：否则「大纲埋点落在本处」的伏笔会被漏掉。
 */
export function useForeshadowDeleteImpact(): {
  inspect: (target: ForeshadowDeleteTarget, mode: ForeshadowDeleteMode) => Promise<string | null>
} {
  const { t } = useTranslation('foreshadow')

  const inspect = useCallback(
    async (target: ForeshadowDeleteTarget, mode: ForeshadowDeleteMode): Promise<string | null> => {
      const api = window.api?.foreshadow
      if (!api) return null
      try {
        const hits = await api.listByAnchorHit(target.chapterId, target.outlineItemId)
        const rows = hits.filter(hasSecondAnchor).map((hit) => hit.row)
        if (rows.length === 0) return null
        // 最多列 3 条名称，其余以「等 N 条」收口，避免确认框被长名单撑爆。
        const names = rows.slice(0, 3).map((row) => row.title.trim() || t('field.untitled'))
        const joined = names.join(t('deleteImpact.separator'))
        const titles =
          rows.length > 3 ? t('deleteImpact.more', { titles: joined, count: rows.length }) : joined
        return mode === 'purge'
          ? t('deleteImpact.purge', { titles })
          : t('deleteImpact.soft', { titles })
      } catch {
        return null
      }
    },
    [t]
  )

  return { inspect }
}

/**
 * 把提示拼进现有确认框正文：无提示时原样返回字符串（保持原流程零变化）；
 * 有提示时拆成两段，第二段用危险色强调（样式见 `styles/writer-trash.css`）。
 */
export function withDeleteImpactWarning(message: string, warning: string | null): ReactNode {
  if (warning === null) return message
  return (
    <>
      <p>{message}</p>
      <p className="confirm-msg__warning">{warning}</p>
    </>
  )
}
