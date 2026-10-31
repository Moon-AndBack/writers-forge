import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, Input } from '../../../components/ui'
import { ChevronIcon } from '../icons'
import type { OutlineSearchController } from './useOutlineSearch'

export interface OutlineSearchViewProps {
  /** 查找 / 替换状态机（由 OutlineEditor 提供，绑定当前编辑器文档）。 */
  controller: OutlineSearchController
  /** 浮窗是否打开（关闭时不渲染内容）。 */
  open: boolean
  /** 关闭浮窗。 */
  onClose: () => void
}

/** 关闭（×）图标。 */
function CloseIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

/**
 * 大纲条目「当前内容」查找 / 替换浮窗（右上侧）：锚定写作中栏右上角，
 * 绝对定位于 `.ep-view[data-view='outline']` 之内（复用 writer-search.css 的 `.ep-search`）。
 *
 * 与章节搜索浮窗（`chapters/ChaptersSearchView`）的差异：
 * - **仅当前编辑内容**（当前选中条目的正文），无「本章 / 全书」范围切换、无结果列表、无跨条目跳转；
 * - 命中高亮直接落在编辑器内（`OutlineSearchHighlight` Decoration），浮窗只提供
 *   计数 + 上一个 / 下一个 + 替换 / 全部替换。
 */
export default function OutlineSearchView({ controller, open, onClose }: OutlineSearchViewProps) {
  const { t } = useTranslation('outline')
  const {
    query,
    replacement,
    total,
    activeIndex,
    setQuery,
    setReplacement,
    next,
    prev,
    replaceOne,
    replaceAll
  } = controller

  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // 打开时聚焦搜索框（首次打开体验）。
  useEffect(() => {
    if (!open) return undefined
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  // 浮窗展开期间：指针按下落在浮窗外时关闭（先排除开启按钮 data-search-toggle，避免误关）。
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

  // 浮窗展开期间：Esc 关闭（已 preventDefault 的 Esc 不重复响应）。
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

  const hasQuery = query.trim() !== ''

  return (
    <div className="ep-search" role="search" aria-label={t('search.aria')} ref={rootRef}>
      <div className="ep-search-head">
        <span className="ep-search-title">{t('search.title')}</span>
        <span className="spacer" />
        <span className="ep-search-count">
          {!hasQuery
            ? ''
            : total === 0
              ? t('search.none')
              : t('search.count', { index: activeIndex + 1, total })}
        </span>
        <IconButton size="sm" className="row-act" label={t('search.close')} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="ep-search-fields">
        <Input
          ref={inputRef}
          size="sm"
          className="ep-search-input"
          placeholder={t('search.placeholderSearch')}
          value={query}
          spellCheck={false}
          aria-label={t('search.ariaSearch')}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.shiftKey) prev()
              else next()
            }
          }}
        />
        <Input
          size="sm"
          className="ep-search-input"
          placeholder={t('search.placeholderReplace')}
          value={replacement}
          spellCheck={false}
          aria-label={t('search.ariaReplace')}
          onChange={(event) => setReplacement(event.target.value)}
        />
        <div className="ep-search-actions">
          <IconButton
            size="sm"
            className="row-act"
            label={t('search.prev')}
            tooltipPlacement="top"
            disabled={total === 0}
            onClick={prev}
          >
            <span
              style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}
              aria-hidden="true"
            >
              <ChevronIcon width={14} />
            </span>
          </IconButton>
          <IconButton
            size="sm"
            className="row-act"
            label={t('search.next')}
            tooltipPlacement="top"
            disabled={total === 0}
            onClick={next}
          >
            <span style={{ display: 'inline-flex' }} aria-hidden="true">
              <ChevronIcon width={14} />
            </span>
          </IconButton>
          <span className="spacer" />
          <Button
            variant="secondary"
            size="sm"
            disabled={total === 0 || activeIndex < 0}
            onClick={replaceOne}
          >
            {t('search.replace')}
          </Button>
          <Button variant="ghost" size="sm" disabled={total === 0} onClick={replaceAll}>
            {t('search.replaceAll')}
          </Button>
        </div>
      </div>

      {hasQuery && total === 0 ? (
        <div className="ep-search-empty">{t('search.noMatch')}</div>
      ) : null}
    </div>
  )
}
