import { useCallback, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'

/**
 * 大纲编辑头题名编辑 hook：对齐 `chapters/useChapterName` 的编辑范式——
 * 目标切换时重置输入值（React「prop 变化期调整 state」范式，不用 effect，
 * 规避 set-state-in-effect）；失焦 / Enter 提交，Escape 还原；
 * **不含 prefix 逻辑**（前缀为纯展示，由页面层派生传入展示组件）。
 *
 * 提交策略与章节侧同口径：**失焦 / Enter 提交**（不做按键逐次写库），降低 IPC 频次，
 * 避免中文输入法组合期反复落库。与当前题名一致（trim 后比较）不写库。
 */

export interface UseOutlineTitleOptions {
  /** 目标同步 key（`kind\0id`；null = 无目标）。变化时重置输入值。 */
  targetKey: string | null
  /** 题名初值（目标行当前名）；无目标时空串（输入禁用）。 */
  initialTitle: string
  /** 提交落库：调用方绑定对应域的 rename 回调。 */
  onCommitTitle: (title: string) => void
}

export interface UseOutlineTitleResult {
  /** 题名受控值。 */
  value: string
  /** 题名输入 change。 */
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  /** 失焦提交（Enter 亦复用）。 */
  commit: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function useOutlineTitle({
  targetKey,
  initialTitle,
  onCommitTitle
}: UseOutlineTitleOptions): UseOutlineTitleResult {
  // 目标变化时重置输入值；同一目标的「名编辑」写回不重置，保留用户正在输入 / 刚提交的原文。
  const [value, setValue] = useState(initialTitle)
  const [syncedKey, setSyncedKey] = useState(targetKey)
  if (syncedKey !== targetKey) {
    setSyncedKey(targetKey)
    setValue(initialTitle)
  }

  // 失焦 / Enter 落库；无目标不提交，与当前题名一致（trim 后比较）不写库。
  const commit = useCallback((): void => {
    if (targetKey === null) return
    const trimmed = value.trim()
    if (trimmed === initialTitle.trim()) return
    onCommitTitle(trimmed)
  }, [targetKey, value, initialTitle, onCommitTitle])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setValue(initialTitle)
      }
    },
    [commit, initialTitle]
  )

  return {
    value,
    onChange: (event) => setValue(event.target.value),
    commit,
    onKeyDown
  }
}
