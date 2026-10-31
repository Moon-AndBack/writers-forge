import { useCallback, useEffect, useState } from 'react'

/** 引导门控状态：loading（读取中）| required（需引导）| done（已完成）。 */
export type OnboardingStatus = 'loading' | 'required' | 'done'

export interface UseOnboardingResult {
  /** 当前门控状态。 */
  status: OnboardingStatus
  /** 标记引导完成（仅切换本地状态，持久化由 Welcome 负责）。 */
  complete: () => void
}

/**
 * 读取「首次启动引导」门控状态。
 * 完成判定：`onboardingCompleted === 'true'` 或已有非空 `penName`（兼容旧数据）。
 * - 无 Electron settings 接口（纯浏览器预览）→ 视为已完成，避免预览被卡在引导页；
 * - 满足上述任一条件 → 已完成，否则进入引导；
 * - 读取异常 → 视为已完成，保证应用可用（宁可跳过引导，也不阻塞进入主界面）。
 */
export function useOnboarding(): UseOnboardingResult {
  // 纯浏览器（无 settings 接口）时同步落到「已完成」，避免首帧后再 setState。
  const [status, setStatus] = useState<OnboardingStatus>(() =>
    window.api?.settings ? 'loading' : 'done'
  )

  useEffect(() => {
    const api = window.api?.settings
    if (!api) return

    let active = true
    Promise.all([api.get('onboardingCompleted'), api.get('penName')])
      .then(([completed, penName]) => {
        if (!active) return
        const done = completed === 'true' || (penName ?? '').trim() !== ''
        setStatus(done ? 'done' : 'required')
      })
      .catch(() => {
        if (active) setStatus('done')
      })

    return () => {
      active = false
    }
  }, [])

  const complete = useCallback(() => setStatus('done'), [])

  return { status, complete }
}

export default useOnboarding
