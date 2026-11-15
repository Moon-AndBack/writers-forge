/**
 * 筛选关键词草稿（标题栏筛选行：设定档案 / 伏笔 / 灵感共用）。
 *
 * 为什么要草稿：搜索框每次按键都写筛选 Context，会触发 Provider → 中栏网格全量重渲染，
 * 故本地受控 + 停止输入 `FILTER_QUERY_DEBOUNCE` 后再提交；组合输入（IME）期间挂起，
 * `compositionend` 后再按防抖提交，避免把拼音阶段当成关键词。
 *
 * 提交时机：防抖窗口结束 / 失焦 / Enter / 清空 / 卸载。卸载也会 flush，保证最后一次
 * 输入不随组件卸载（切换模块）丢失；提交函数经 ref 调用，本实例固定写入
 * 挂载时所属模块，不会串到别的模块。
 *
 * 外部采纳：新建成功后域内会清空筛选（含关键词），标题栏常驻后若仍显示旧草稿，
 * 会出现「输入框有词、网格已清空」的不一致——故外部值变化且与已提交值不同时，
 * 采纳外部值并取消挂起的防抖（见下方 effect）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CompositionEvent as ReactCompositionEvent,
  KeyboardEvent as ReactKeyboardEvent
} from 'react'

/** 搜索输入提交防抖（ms）：停止打字后 200ms 再写筛选条件。 */
export const FILTER_QUERY_DEBOUNCE = 200

/** 草稿值 + 可直接展开到搜索框的原生事件处理器。 */
export interface FilterQueryDraft {
  /** 输入框当前显示值（本地草稿，可能尚未提交）。 */
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: (event: ReactCompositionEvent<HTMLInputElement>) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  onBlur: () => void
  /** 清空并立即提交（点清除按钮需要即时反馈）。 */
  onClear: () => void
  /** 立即提交挂起的本地值（提交前由调用方主动调用，如「搜索」按钮）。 */
  flush: () => void
}

/**
 * @param initialValue 筛选条件中的关键词（真源）。挂载时取初值，之后仅在外部值
 *   与已提交值不同（如新建后清空筛选）时采纳外部值。
 * @param commit 写入筛选条件（相同值会被跳过，减少无谓重渲染）。
 */
export function useFilterQueryDraft(
  initialValue: string,
  commit: (value: string) => void
): FilterQueryDraft {
  const [value, setValue] = useState(initialValue)
  /** 最新本地值：flush 走 ref，避免卸载 / 失焦回调拿到旧 state。 */
  const valueRef = useRef(initialValue)
  /** 已写入筛选条件的值（相同值不再写）。 */
  const committedRef = useRef(initialValue)
  /** 组合输入（中文拼音等）期间挂起提交。 */
  const composingRef = useRef(false)
  /** 是否有尚未写入的本地值。 */
  const pendingRef = useRef(false)
  const debounceTimer = useRef<number | null>(null)
  /**
   * 提交函数每次渲染可能是新闭包（依赖模块 / setter），走 ref 保证 flush 引用稳定；
   * 在 effect 中更新，卸载清理阶段拿到的仍是上一轮渲染的正确闭包。
   */
  const commitRef = useRef(commit)

  useEffect(() => {
    commitRef.current = commit
  }, [commit])

  const cancelDebounce = useCallback((): void => {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
  }, [])

  /**
   * 外部采纳：域内在新建成功后清空筛选（`ForeshadowView` / `useInspirationBundle`），
   * 标题栏常驻后输入框若不跟随，会继续显示旧词而网格已清空。
   * 只在外部值与已提交值不同时采纳——本实例提交后外部回写的同值不会打断正在进行的输入；
   * 采纳时取消挂起的防抖，避免随后用旧草稿覆盖外部条件。
   */
  useEffect(() => {
    if (initialValue === committedRef.current) return
    committedRef.current = initialValue
    pendingRef.current = false
    valueRef.current = initialValue
    setValue(initialValue)
    cancelDebounce()
  }, [cancelDebounce, initialValue])

  /** 写入筛选条件：与已提交值相同则跳过。 */
  const commitNow = useCallback((next: string): void => {
    if (next === committedRef.current) return
    committedRef.current = next
    commitRef.current(next)
  }, [])

  /**
   * 立即提交挂起的本地值（失焦 / Enter / 卸载共用）：先清防抖计时，再写最新值。
   */
  const flush = useCallback((): void => {
    cancelDebounce()
    if (!pendingRef.current) return
    pendingRef.current = false
    commitNow(valueRef.current)
  }, [cancelDebounce, commitNow])

  /** 防抖提交：组合输入期间不排。 */
  const scheduleCommit = useCallback((): void => {
    cancelDebounce()
    pendingRef.current = true
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = null
      pendingRef.current = false
      commitNow(valueRef.current)
    }, FILTER_QUERY_DEBOUNCE)
  }, [cancelDebounce, commitNow])

  // 卸载（切换模块）时先 flush 再清理，防抖窗口内的最后一次输入不丢。
  useEffect(() => flush, [flush])

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value
    valueRef.current = next
    setValue(next)
    pendingRef.current = true
    if (composingRef.current) {
      cancelDebounce()
      return
    }
    scheduleCommit()
  }

  const onCompositionStart = (): void => {
    composingRef.current = true
    cancelDebounce()
  }

  const onCompositionEnd = (event: ReactCompositionEvent<HTMLInputElement>): void => {
    composingRef.current = false
    const next = event.currentTarget.value
    valueRef.current = next
    setValue(next)
    scheduleCommit()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    // 组合输入中按 Enter 是确认候选词，不当作提交。
    if (event.nativeEvent.isComposing || composingRef.current) return
    if (event.key !== 'Enter') return
    event.preventDefault()
    flush()
  }

  const onBlur = (): void => {
    composingRef.current = false
    flush()
  }

  const onClear = (): void => {
    cancelDebounce()
    pendingRef.current = false
    valueRef.current = ''
    setValue('')
    commitNow('')
  }

  return {
    value,
    onChange,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    onBlur,
    onClear,
    flush
  }
}
