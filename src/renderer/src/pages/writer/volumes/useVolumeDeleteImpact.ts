import { useCallback } from 'react'
import type { VolumeDeleteImpact } from '../../../../../main/database/volumes'

/**
 * 删除卷 / 分组前的跨域影响预检（章节页与大纲页共用，§9 唯一实现）。
 *
 * 卷级软删会同时联动两域：章节页删卷会级联软删其下章节与全部大纲行，
 * 大纲页删卷 / 分组会级联软删其下条目并影响正文章节。确认框需要在弹前拿到
 * 「章节数 / 大纲条目数」以明确告知用户影响范围。
 *
 * 查询失败按 `null` 处理，调用方回退静态文案，绝不阻断删除流程。
 */
export function useVolumeDeleteImpact(): {
  inspect: (volumeId: number) => Promise<VolumeDeleteImpact | null>
} {
  const inspect = useCallback(async (volumeId: number): Promise<VolumeDeleteImpact | null> => {
    const api = window.api?.chapters
    if (!api) return null
    try {
      return await api.volumeDeleteImpact(volumeId)
    } catch {
      return null
    }
  }, [])

  return { inspect }
}
