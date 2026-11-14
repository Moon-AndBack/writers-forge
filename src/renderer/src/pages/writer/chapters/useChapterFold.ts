/**
 * 章节卷折叠挂载控制：折叠后卸载章行，展开时重新挂载。
 *
 * `.chapters` 的展开 / 收起依赖 `grid-template-rows: 0fr → 1fr` 过渡（0.22s，见
 * `styles/writer-side-chapters.css`）。若收起时立刻卸载，过渡没有内容可收缩；若始终
 * 挂载，全部章行常驻 DOM。故收起时先登记 `closingKeys` 继续挂载，等
 * `grid-template-rows` 的 `transitionend` 后再卸载。
 *
 * 重挂载的章行不需要再播一次 `wf-enter-up` 进场（否则每次展开整列上浮），由
 * `suppressEnter` 标记给 `ChapterList` 做「本批行」快照；首次进入页面与新建章不受影响。
 */
import { useCallback, useState, type TransitionEvent } from 'react'

/** 折叠挂载控制接口。 */
export interface ChapterFold {
  /** 切换卷展开态；收起时登记延迟卸载与「重挂载」标记。 */
  toggle: (key: string) => void
  /** 该卷章列表当前是否需要挂载（展开中，或收起过渡尚未结束）。 */
  isMounted: (key: string) => boolean
  /** 本次挂载是否属于「收起后重开」：是则抑制本批章行的进场动画。 */
  suppressEnter: (key: string) => boolean
  /** 绑定到 `.chapters` 的 onTransitionEnd：收起过渡结束后卸载。 */
  onFoldEnd: (key: string, event: TransitionEvent<HTMLDivElement>) => void
}

export function useChapterFold(
  isOpen: (key: string) => boolean,
  toggleVolume: (key: string) => void
): ChapterFold {
  // 收起过渡期间仍需挂载的卷（过渡结束后移除）
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(() => new Set<string>())
  // 已收起过的卷：再次展开属于重挂载，需抑制本批行进场
  const [mountedBefore, setMountedBefore] = useState<ReadonlySet<string>>(() => new Set<string>())

  const toggle = useCallback(
    (key: string): void => {
      if (isOpen(key)) {
        setClosingKeys((prev) => {
          if (prev.has(key)) return prev
          const next = new Set(prev)
          next.add(key)
          return next
        })
        setMountedBefore((prev) => {
          if (prev.has(key)) return prev
          const next = new Set(prev)
          next.add(key)
          return next
        })
      }
      toggleVolume(key)
    },
    [isOpen, toggleVolume]
  )

  const isMounted = useCallback(
    (key: string): boolean => isOpen(key) || closingKeys.has(key),
    [isOpen, closingKeys]
  )

  const suppressEnter = useCallback(
    (key: string): boolean => mountedBefore.has(key),
    [mountedBefore]
  )

  const onFoldEnd = useCallback(
    (key: string, event: TransitionEvent<HTMLDivElement>): void => {
      if (event.target !== event.currentTarget) return
      if (event.propertyName !== 'grid-template-rows') return
      // 反向展开（过渡被中断）时不卸载；仅收起动画真正结束时清掉登记。
      if (isOpen(key)) return
      setClosingKeys((prev) => {
        if (!prev.has(key)) return prev
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    },
    [isOpen]
  )

  return { toggle, isMounted, suppressEnter, onFoldEnd }
}
