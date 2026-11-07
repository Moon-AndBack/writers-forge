import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, EditorEvents } from '@tiptap/core'
import { POPOVER_HIDE_DELAY, POPOVER_SHOW_DELAY } from '../popoverTiming'
import {
  FORESHADOW_ID_ATTR,
  FORESHADOW_KIND_ATTR,
  foreshadowMarkKey,
  type ForeshadowMarkEntry
} from './foreshadowMarks'

/**
 * 标记悬停浮层的三行内容（`MarkHoverTip` 的唯一内容结构）。
 *
 * 与伏笔的 `ForeshadowMarkTip` 字段逐一同名，故伏笔侧可直接直传条目 `tip`，
 * 无需映射；违禁词等其它标记（无描述行）把 `description` 置空串即可。
 */
export interface MarkHoverContent {
  /** 第 1 行：唯一强调行（伏笔名 / 命中词本身）。 */
  heading: string
  /** 第 2 行：状态 / 位置 / 类别（次要色）。 */
  status: string
  /** 第 3 行：描述（最弱色；空串不渲染该行）。 */
  description: string
}

/**
 * 正文标记的悬停提示状态（`MarkHoverTip` 的唯一入参）。
 *
 * 内容与装饰同源：装饰只写定位用的 data 属性，真正的三行内容由调用方经
 * `resolve` 从插件 state / 词表元信息组好，标记层不写原生 `title`。
 */
export interface MarkHoverState {
  /** 触发悬停的标记 span（活元素：滚动 / 重排后浮层按其最新视口矩形重定位）。 */
  anchorEl: HTMLElement
  /** 悬停瞬间的视口矩形（活元素断开时的兜底）。 */
  rect: DOMRect
  /** 悬停三行内容（`resolve` 的返回；`heading` 为空不会产生提示）。 */
  content: MarkHoverContent
}

/** 内部状态：在 {@link MarkHoverState} 上附带归属 key，用于判定跨章 / 跨条目过期。 */
interface MarkHoverEntry extends MarkHoverState {
  resetKey: string | number | null
}

/** 标记 span → 三行内容（返回 `null` = 该标记不弹浮层）。 */
export type MarkHoverResolver = (value: string, el: HTMLElement) => MarkHoverContent | null

/** 通用标记悬停配置。 */
export interface MarkHoverOptions {
  /** 标记 span 上的 data 属性名（如 `data-foreshadow-id` / `data-clean-word`）。 */
  attribute: string
  /** 取内容：首参为该属性的值，次参为命中元素（可读同元素其它属性）。 */
  resolve: MarkHoverResolver
  /** 文档切换键（章节 id / 大纲条目 id）：变化即收起，默认 `null`。 */
  resetKey?: string | number | null
}

/**
 * 正文标记的通用悬停浮层（伏笔 / 违禁词等任意 data 属性标记共用，§9 唯一实现）。
 *
 * 为什么不用 `title`：原生气泡方角、约 1s 延迟、样式不可控、不跟主题，
 * 与项目其它提示（`useTooltip` / `HoverPopupShell`）风格不一致。
 *
 * 实现要点：
 * - **事件委托在 `editor.view.dom`**（不经 `editorProps`、不 dispatch 事务）：装饰 span 是
 *   ProseMirror 反复重建的 DOM，逐个绑定监听既漏挂又泄漏；委托只挂三个监听即可；
 * - 命中 `[attribute]` 后交给 `resolve` 取内容（`resolve` 在显形计时到点后再查一次，
 *   延迟窗口内可能发生改名 / 回收刷新）；
 * - 显示 260ms / 隐藏 120ms（`popoverTiming`），与实体悬停卡同一手感；
 * - **文档变更立即收起**：`docChanged` 事务后装饰 span 会被重建，旧 `anchorEl` 断开后
 *   浮层只能停在过期位置；
 * - 切章 / 切条目（`resetKey` 变化）时 effect 重挂并清计时，旧提示按 `resetKey` 比对
 *   判定过期——不在渲染期或 effect 体内 setState（规避 `react-hooks` 相关规则）。
 */
export function useEditorMarkHover(
  editor: Editor | null,
  options: MarkHoverOptions
): MarkHoverState | null {
  const { attribute, resolve, resetKey = null } = options
  const [tip, setTip] = useState<MarkHoverEntry | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  /** 当前悬停的标记 span（含「已进入、尚未显形」阶段）。 */
  const hoverElRef = useRef<HTMLElement | null>(null)
  /** 已显形提示的锚点 span（`null` = 当前没有可见提示）。 */
  const shownElRef = useRef<HTMLElement | null>(null)

  /** 清掉挂起的显示 / 隐藏计时（`null` 视为空闲）。 */
  const clearTimers = useCallback((): void => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (editor === null || editor.isDestroyed) return undefined
    const dom = editor.view.dom

    /** 起「显形」计时：到点后再查一次内容（延迟窗口内可能发生改名 / 回收刷新）。 */
    const scheduleShow = (el: HTMLElement): void => {
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null
        // 期间 span 可能已被重建 / 移除（切章、编辑）——断开的锚点不显示。
        if (!el.isConnected) return
        const content = resolve(el.getAttribute(attribute) ?? '', el)
        if (content === null || content.heading === '') return
        shownElRef.current = el
        setTip({ anchorEl: el, rect: el.getBoundingClientRect(), content, resetKey })
      }, POPOVER_SHOW_DELAY)
    }

    const handleOver = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      const el = target.closest<HTMLElement>(`[${attribute}]`)
      if (el === null) return
      // 同一标记内移动（span ↔ 子节点 / 嵌套标记）：不重开显示计时，只撤销挂起的隐藏。
      if (el === hoverElRef.current) {
        if (hideTimerRef.current !== null) {
          window.clearTimeout(hideTimerRef.current)
          hideTimerRef.current = null
        }
        if (shownElRef.current !== el && showTimerRef.current === null) scheduleShow(el)
        return
      }
      // 切换到另一个标记：旧标记的挂起计时（显示 / 隐藏）全部作废 —— 旧隐藏计时到点会把
      // 刚进入的新标记一起清掉（hoverElRef = null），而旧提示若已显形必须立即收起，
      // 否则 refs 已换、tip 仍旧，旧提示会永久停在新锚点位置。
      clearTimers()
      if (shownElRef.current !== null) {
        shownElRef.current = null
        setTip(null)
      }
      hoverElRef.current = el
      scheduleShow(el)
    }

    const handleOut = (event: MouseEvent): void => {
      // 守卫：优先取当前悬停标记；refs 已空但提示仍在显示时退回已显形锚点，
      // 否则后续 mouseout 全部提前 return，「refs 清空 + tip 残留」会让提示永久卡住。
      const el = hoverElRef.current ?? shownElRef.current
      if (el === null) return
      if (!(event.target instanceof Node) || !el.contains(event.target)) return
      // `relatedTarget` 仍在同一标记内（子节点之间移动）→ 不算离开。
      if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return
      // 尚未显形就离开：直接丢弃，不必等隐藏延迟。
      if (shownElRef.current !== el) {
        clearTimers()
        hoverElRef.current = null
        // 兜底：仍有残留的显形提示（跨标记切换的中间态）一并收起，避免永久滞留。
        if (shownElRef.current !== null) {
          shownElRef.current = null
          setTip(null)
        }
        return
      }
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = window.setTimeout(() => {
        hideTimerRef.current = null
        hoverElRef.current = null
        shownElRef.current = null
        setTip(null)
      }, POPOVER_HIDE_DELAY)
    }

    /**
     * 指针离开正文 DOM（如移入 body 下的实体悬停卡）：立即收起，不等 120ms 隐藏延迟。
     * `mouseleave` 不冒泡，直接挂在 `editor.view.dom` 上即可覆盖「离开编辑区」。
     */
    const handleLeave = (): void => {
      clearTimers()
      hoverElRef.current = null
      shownElRef.current = null
      setTip(null)
    }

    /** 文档变更 → 装饰 span 会被重建，`anchorEl` 失效会让浮层停在过期位置，立即收起。 */
    const handleTransaction = ({ transaction }: EditorEvents['transaction']): void => {
      if (!transaction.docChanged) return
      if (showTimerRef.current === null && shownElRef.current === null) return
      clearTimers()
      hoverElRef.current = null
      shownElRef.current = null
      setTip(null)
    }

    dom.addEventListener('mouseover', handleOver)
    dom.addEventListener('mouseout', handleOut)
    dom.addEventListener('mouseleave', handleLeave)
    editor.on('transaction', handleTransaction)
    return () => {
      dom.removeEventListener('mouseover', handleOver)
      dom.removeEventListener('mouseout', handleOut)
      dom.removeEventListener('mouseleave', handleLeave)
      editor.off('transaction', handleTransaction)
      clearTimers()
      hoverElRef.current = null
      shownElRef.current = null
    }
  }, [editor, attribute, resolve, resetKey, clearTimers])

  // 切章 / 切条目：旧提示按 resetKey 判过期（state 本身留给下一次悬停覆写）。
  if (tip !== null && tip.resetKey !== resetKey) return null
  return tip
}

/** 伏笔标记 span → 插件 state 条目（`id + kind` 双条件，避免同一伏笔两处内容串台）。 */
function resolveForeshadowContent(
  editor: Editor,
  value: string,
  el: HTMLElement
): MarkHoverContent | null {
  const id = Number(value)
  if (!Number.isInteger(id)) return null
  const kind = el.getAttribute(FORESHADOW_KIND_ATTR)
  const entries: readonly ForeshadowMarkEntry[] = foreshadowMarkKey.getState(editor.state) ?? []
  const entry = entries.find((item) => item.id === id && (kind === null || item.kind === kind))
  return entry?.tip ?? null
}

/**
 * 伏笔正文标记的悬停提示（`useEditorMarkHover` 的薄封装，调用签名不变）。
 *
 * 章节编辑器与大纲编辑器共用；只固定伏笔的属性名与取内容方式，显隐 / 延迟 /
 * 过期判定全部交给通用 hook。
 */
export function useMarkHover(
  editor: Editor | null,
  resetKey: string | number | null = null
): MarkHoverState | null {
  const resolve = useCallback<MarkHoverResolver>(
    (value, el) => (editor === null ? null : resolveForeshadowContent(editor, value, el)),
    [editor]
  )
  return useEditorMarkHover(editor, { attribute: FORESHADOW_ID_ATTR, resolve, resetKey })
}

export default useMarkHover
