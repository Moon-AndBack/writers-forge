import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton, Input, Segmented } from '../../../components/ui'
import { ReplaceIcon } from '../icons'
import type { ChapterSearchHit, ChapterSearchController } from './useChapterSearch'
import { type ChapterRow } from './chapterTree'
import { useChapterLabels } from './useChapterLabels'

export interface ChaptersSearchViewProps {
  /** 搜索 / 替换状态机（由 ChaptersView 提供，含编辑器联动回调）。 */
  controller: ChapterSearchController
  /** 浮窗是否打开（关闭时不渲染内容）。 */
  open: boolean
  /** 关闭浮窗。 */
  onClose: () => void
  /** 同书全部未删除章（命中行展示动态章名 / 组内编号口径）。 */
  chapters: ChapterRow[]
}

const SCOPE_OPTIONS = [
  { value: 'chapter', labelKey: 'search.scopeChapter' },
  { value: 'book', labelKey: 'search.scopeBook' }
] as const

/** 单条命中最多展示的上下文字符数（超出以…省略）。 */
const CONTEXT_MAX = 180

/** 上下文中点：命中起始处前后各取字符，保证命中词可见。 */
function contextWindow(
  context: string,
  start: number,
  end: number
): { before: string; hit: string; after: string } {
  if (context.length <= CONTEXT_MAX) {
    return {
      before: context.slice(0, start),
      hit: context.slice(start, end),
      after: context.slice(end)
    }
  }
  const lead = Math.max(0, start - Math.floor((CONTEXT_MAX - (end - start)) / 2))
  const trail = Math.min(context.length, lead + CONTEXT_MAX)
  const before = (lead > 0 ? '…' : '') + context.slice(lead, start)
  const hit = context.slice(start, end)
  const after = context.slice(end, trail) + (trail < context.length ? '…' : '')
  return { before, hit, after }
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
 * 章节搜索 / 替换浮窗（右上侧）：锚定写作中栏右上角，绝对定位于 `.ep-view[data-view='chapters']`
 * 之内（见 writer-search.css 的 `.ep-search`）。选择在视图内绝对定位而非 portal 的原因：
 * 浮窗随中栏视图一同显隐 / 裁切，无需处理滚动、窗口缩放与 portal 生命周期，且天然层级正确。
 *
 * 结构：头部（标题 + 关闭） / 范围切换（本章 / 全书） / 搜索框 / 替换框 + 替换 / 替换全部 /
 * 结果列表（每行 = 章名 + 命中上下文高亮 + 行尾「替换」按钮）。列表滚动、分页（加载更多）。
 */
export default function ChaptersSearchView({
  controller,
  open,
  onClose,
  chapters
}: ChaptersSearchViewProps) {
  const { t } = useTranslation('chapters')
  const labels = useChapterLabels()
  const { t: tCommon } = useTranslation('common')
  const {
    query,
    replacement,
    scope,
    items,
    total,
    hasMore,
    truncated,
    loading,
    busy,
    error,
    active,
    setQuery,
    setReplacement,
    setScope,
    loadMore,
    requestJump,
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

  const hasQuery = query.trim() !== ''
  const titleOf = (hit: ChapterSearchHit): string => {
    const chapter = chapters.find((row) => row.id === hit.chapterId)
    return chapter ? labels.chapterLabel(chapter) : hit.chapterTitle
  }

  return (
    <div className="ep-search" role="search" aria-label={t('search.aria')} ref={rootRef}>
      <div className="ep-search-head">
        <span className="ep-search-title">{t('search.title')}</span>
        <span className="spacer" />
        <IconButton size="sm" className="row-act" label={t('search.close')} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <div className="ep-search-scope">
        <Segmented
          size="sm"
          options={SCOPE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.labelKey)
          }))}
          value={scope}
          aria-label={t('search.rangeAria')}
          onChange={setScope}
        />
        <span className="ep-search-count">
          {hasQuery
            ? loading && items.length === 0
              ? t('search.searching')
              : t('search.count', { total })
            : ''}
        </span>
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
          <Button
            variant="secondary"
            size="sm"
            disabled={!active || busy}
            onClick={() => active && replaceOne(active)}
          >
            {t('search.replace')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasQuery || total === 0 || busy}
            onClick={replaceAll}
          >
            {t('search.replaceAll')}
          </Button>
        </div>
      </div>

      {error !== null ? <div className="ep-search-error">{error}</div> : null}

      <div className="ep-search-results">
        {hasQuery && items.length === 0 && !loading ? (
          <div className="ep-search-empty">{t('search.empty')}</div>
        ) : (
          items.map((hit, index) => {
            const win = contextWindow(hit.context, hit.start, hit.end)
            const isActive = active === hit
            return (
              <div
                key={`${hit.chapterId}-${hit.paragraphIdx}-${hit.start}-${index}`}
                className={`ep-search-row${isActive ? ' is-active' : ''}`}
                onClick={() => requestJump(hit)}
              >
                <span className="ep-search-row-main">
                  <span className="ep-search-row-chapter">{titleOf(hit)}</span>
                  <span className="ep-search-row-context">
                    {win.before}
                    <mark className="ep-search-hit">{win.hit}</mark>
                    {win.after}
                  </span>
                </span>
                <IconButton
                  size="sm"
                  className="row-act ep-search-row-replace"
                  label={t('search.replaceHere')}
                  tooltipPlacement="left"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation()
                    replaceOne(hit)
                  }}
                >
                  <ReplaceIcon />
                </IconButton>
              </div>
            )
          })
        )}

        {hasQuery && hasMore ? (
          <button type="button" className="ep-search-more" disabled={loading} onClick={loadMore}>
            {loading ? tCommon('loading') : tCommon('loadMore')}
          </button>
        ) : null}

        {truncated ? (
          <div className="ep-search-note">{t('search.truncated', { total })}</div>
        ) : null}
      </div>
    </div>
  )
}
