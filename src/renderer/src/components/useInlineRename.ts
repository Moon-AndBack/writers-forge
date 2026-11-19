/**
 * 行内改名的共享状态机（章节卷 / 大纲卷与分组 / 时间线 / 备份列表共用）。
 *
 * 只负责「谁在改名、草稿值、何时结算」；空名、同值、失败反馈等提交策略一律由
 * 调用方的 `onCommit` 决定（现有三种口径：可清空、必填空串即取消、交给领域层
 * 回退默认名，不能内置）。
 *
 * 防重：Enter 提交后输入框卸载，浏览器可能再触发一次 blur；`settledRef` 让第二次
 * 结算直接返回，避免同一笔改名写两次（Escape 取消同样先置位，随后 blur 不再提交）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'

/** 可直接展开到原生输入框的事件处理器。 */
export interface InlineRenameInputProps {
  value: string
  autoFocus: true
  spellCheck: false
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onBlur: () => void
}

export interface InlineRename<Id> {
  /** 正在改名的条目 id；null = 无改名态。 */
  renamingId: Id | null
  /** 当前草稿（未 trim，输入框原样显示）。 */
  draft: string
  /** 进入改名态：条目 id 与输入框初值。 */
  begin: (id: Id, initialValue: string) => void
  /** 写入草稿（共享行组件用字符串回调，非原生事件）。 */
  setDraft: (value: string) => void
  /** 提交：草稿 trim 后交给 `onCommit`。 */
  commit: () => void
  /** 取消：不调用 `onCommit`。 */
  cancel: () => void
  inputProps: InlineRenameInputProps
}

/**
 * @param onCommit 提交回调：`value` 已 trim，`previous` 为 `begin` 时的初值。
 *   空名 / 同值 / 失败提示由调用方决定；返回 Promise 时 hook 不等结果
 *   （即发即忘，失败提示由调用方在回调内自行处理）。
 */
export function useInlineRename<Id extends string | number>({
  onCommit
}: {
  onCommit: (id: Id, value: string, previous: string) => void
}): InlineRename<Id> {
  const [renamingId, setRenamingId] = useState<Id | null>(null)
  const [draft, setDraftState] = useState('')
  /** 已结算标记：初值 true（未改名时任何 blur / Enter 都不提交），`begin` 复位。 */
  const settledRef = useRef(true)
  /** 本次改名的目标与初值：结算走 ref，不受 state 更新时序影响。 */
  const idRef = useRef<Id | null>(null)
  const previousRef = useRef('')
  /** 最新草稿：`commit` 为稳定闭包，不能依赖渲染时的 state。 */
  const draftRef = useRef('')
  /** 提交回调走 ref：调用方无需为闭包变化额外稳定 `onCommit`。 */
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const setDraft = useCallback((value: string): void => {
    draftRef.current = value
    setDraftState(value)
  }, [])

  const begin = useCallback(
    (id: Id, initialValue: string): void => {
      idRef.current = id
      previousRef.current = initialValue
      settledRef.current = false
      setDraft(initialValue)
      setRenamingId(id)
    },
    [setDraft]
  )

  const commit = useCallback((): void => {
    if (settledRef.current) return
    settledRef.current = true
    const id = idRef.current
    const previous = previousRef.current
    const value = draftRef.current.trim()
    setRenamingId(null)
    if (id === null) return
    onCommitRef.current(id, value, previous)
  }, [])

  const cancel = useCallback((): void => {
    if (settledRef.current) return
    settledRef.current = true
    setRenamingId(null)
  }, [])

  const inputProps: InlineRenameInputProps = {
    value: draft,
    autoFocus: true,
    spellCheck: false,
    onChange: (event) => setDraft(event.target.value),
    onKeyDown: (event) => {
      if (event.key === 'Enter') {
        // 组合输入（拼音等）中 Enter 是确认候选词，不当作提交。
        if (event.nativeEvent.isComposing) return
        event.preventDefault()
        commit()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      }
    },
    onBlur: commit
  }

  return { renamingId, draft, begin, setDraft, commit, cancel, inputProps }
}
