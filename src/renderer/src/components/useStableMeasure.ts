import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * 分隔条拖拽期间挂在 `document.body` 上的类（见 `components/ui/useSplitter.ts`）。
 * 左右分栏与上下分栏都会挂它（上下分栏另加 `is-resizing-y`），此处只要「是否在拖拽」。
 */
const RESIZING_CLASS = 'is-resizing'

/**
 * 观察元素尺寸并给出「布局签名」（一个取整后的宽度 / 可用宽），**拖拽分隔条期间暂停写回**。
 *
 * 为什么需要门控：`ResizeObserver` 的回调会在拖拽的每一帧触发，而测量读数（列宽 / 可用宽）
 * 又会驱动卡片折行、卡高、滚动条之类的下游重排；把这些读数逐帧写回 state，等于在
 * 「读 → 写 → 重新布局 → 再读」之间形成逐帧自反馈闭环，观感就是卡片宽高持续抖动。
 * 拖拽期间布局本来每帧都在变，中间值没有意义，故只保留**结束后那一次**测量。
 *
 * 补测时机（`requestAnimationFrame` 重试链，单飞）：拖拽中每次回调只登记一个待跑帧，
 * 不改 state；该帧若仍在拖拽则继续等下一帧。拖拽一结束（`body` 摘掉 `is-resizing`），
 * 链上的下一帧即在 React 提交完成之后读到最终布局并写回——因此不会停在中间值。
 *
 * `read` 用于把「元素 → 签名」的换算留给调用方（列宽减内边距、根宽减列宽等各不相同）；
 * 它以 ref 持有，仅在观察目标 / 启用状态变化时重建观察器，不需要调用方 useCallback 化。
 * 首次测量走 `useLayoutEffect`（绘制前），避免首帧按 0 闪一下。
 *
 * @param ref 被观察元素（尺寸变化的来源，如网格容器 / 时间轴根节点）。
 * @param enabled 为 false 时不观察，返回上一次的值（初始 0）。
 * @param read 读取函数：入参为被观察元素，返回签名值（px，取整由调用方决定）。
 */
export function useStableMeasure(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  read: (el: HTMLElement) => number
): number {
  const [value, setValue] = useState(0)
  const readRef = useRef(read)

  // 每次渲染同步最新读取函数（不进入下方 effect 依赖，避免每帧重建观察器）。
  useLayoutEffect(() => {
    readRef.current = read
  })

  useLayoutEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return

    // 拖拽结束后补测用的待跑帧（null = 无在途帧；单飞，避免多路回调重复调度）。
    let retry: number | null = null

    const measure = (): void => {
      if (document.body.classList.contains(RESIZING_CLASS)) {
        // 拖拽中：只登记「结束后补测」，不读写布局。
        if (retry === null) {
          retry = requestAnimationFrame(() => {
            retry = null
            measure()
          })
        }
        return
      }
      const next = readRef.current(el)
      setValue((prev) => (prev === next ? prev : next))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      if (retry !== null) cancelAnimationFrame(retry)
      observer.disconnect()
    }
  }, [ref, enabled])

  return value
}
