import { useEffect, useRef } from 'react'
import type { KeyboardEventHandler, ReactNode } from 'react'
import { IconButton, Input } from '../ui'
import { CloseIcon } from '../icons'

/**
 * 写作视图中栏「查找与替换」浮窗的公共外壳：根容器（`role="search"` + 定位 ref）、
 * 头部（标题 / spacer / 头部状态 / 关闭）、搜索 + 替换输入、操作按钮容器、
 * 焦点 / 外部指针 / Esc 三个副作用，以及 `!open` 早退。
 *
 * 为什么只抽外壳（AGENTS §9 例外登记）：章节搜索的 controller 是**跨文档 IPC 搜索结果**
 * （scope / 分页 / 截断 / 错误 / 命中列表），大纲搜索的是**当前文档命中游标**
 * （total / 上一个 / 下一个）。两者契约不同构，强行抽成同一 controller 或统一
 * 「结果区 + 上下条」模型会让两域都不顺手，故差异项（controller、范围行、头部状态、
 * 搜索框键盘、操作区、结果区）一律留在调用方，仅共享外观与交互外壳。
 *
 * 组件不调 `t()`：全部文案（含 aria-label）由 props 传入，保持 i18n 归属在页面层。
 */
export interface SearchReplacePopupProps {
  /** 浮窗是否打开（关闭时不渲染内容）。 */
  open: boolean
  /** 关闭浮窗；调用方须保证引用稳定（useCallback），否则每次渲染都会重挂 window 监听。 */
  onClose: () => void
  /** 头部标题文案。 */
  title: string
  /** 根容器 aria-label（`role="search"`）。 */
  ariaLabel: string
  /** 关闭按钮 aria-label。 */
  ariaClose: string
  /** 搜索词。 */
  query: string
  /** 替换词。 */
  replacement: string
  onQueryChange(value: string): void
  onReplacementChange(value: string): void
  placeholderSearch: string
  placeholderReplace: string
  ariaSearch: string
  ariaReplace: string
  /** 头部右侧状态（大纲传命中 i/n）。 */
  headStatus?: ReactNode
  /** 范围行（仅章节：本章 / 全书 + 计数）。 */
  scopeRow?: ReactNode
  /** 搜索框键盘行为（仅大纲：Enter / Shift+Enter 切换命中）。 */
  onSearchKeyDown?: KeyboardEventHandler<HTMLInputElement>
  /** 操作按钮区（两侧差异最大，整块外置）。 */
  actions: ReactNode
  /** 结果区 / 空态。 */
  children?: ReactNode
}

export default function SearchReplacePopup({
  open,
  onClose,
  title,
  ariaLabel,
  ariaClose,
  query,
  replacement,
  onQueryChange,
  onReplacementChange,
  placeholderSearch,
  placeholderReplace,
  ariaSearch,
  ariaReplace,
  headStatus,
  scopeRow,
  onSearchKeyDown,
  actions,
  children
}: SearchReplacePopupProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 打开时聚焦搜索框（首次打开体验）。
  useEffect(() => {
    if (!open) return undefined
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  // 浮窗展开期间：指针按下落在浮窗外时关闭（与主题弹窗 / PopupSelect 同范式）。
  // 用 pointerdown 判定而非 click，且先看点击是否发生在**开启按钮**（data-search-toggle）上：
  // 点在按钮上时不关，避免「pointerdown 先关 → click 再开」导致按钮失效。
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target)) return
      if (target instanceof Element && target.closest('[data-search-toggle]')) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open, onClose])

  // 浮窗展开期间：Esc 关闭（焦点在浮窗 / 编辑器内时生效）。
  // 已 preventDefault 的 Esc（如上层弹层先行处理）不重复响应，避免误关。
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.key !== 'Escape') return
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="ep-search" role="search" aria-label={ariaLabel} ref={rootRef}>
      <div className="ep-search-head">
        <span className="ep-search-title">{title}</span>
        <span className="spacer" />
        {headStatus}
        <IconButton size="sm" className="row-act" label={ariaClose} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      {scopeRow}

      <div className="ep-search-fields">
        <Input
          ref={inputRef}
          size="sm"
          className="ep-search-input"
          placeholder={placeholderSearch}
          value={query}
          spellCheck={false}
          aria-label={ariaSearch}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
        />
        <Input
          size="sm"
          className="ep-search-input"
          placeholder={placeholderReplace}
          value={replacement}
          spellCheck={false}
          aria-label={ariaReplace}
          onChange={(event) => onReplacementChange(event.target.value)}
        />
        <div className="ep-search-actions">{actions}</div>
      </div>

      {children}
    </div>
  )
}
