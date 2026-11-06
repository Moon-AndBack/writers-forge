import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '../../../components/ui'
import SearchReplacePopup from '../../../components/search/SearchReplacePopup'
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

/**
 * 大纲条目「当前内容」查找 / 替换浮窗（右上侧）：锚定写作中栏右上角，
 * 绝对定位于 `.ep-view[data-view='outline']` 之内（复用 writer-search.css 的 `.ep-search`）。
 *
 * 与章节搜索浮窗（`chapters/ChaptersSearchView`）的差异：
 * - **仅当前编辑内容**（当前选中条目的正文），无「本章 / 全书」范围切换、无结果列表、无跨条目跳转；
 * - 命中高亮直接落在编辑器内（`OutlineSearchHighlight` Decoration），浮窗只提供
 *   计数 + 上一个 / 下一个 + 替换 / 全部替换。
 *
 * 外壳（根容器 / 头部 / 输入区 / 三个副作用）由 `components/search/SearchReplacePopup` 共享；
 * 本域的命中计数、搜索框 Enter 切换、上一个 / 下一个与无匹配提示作为插槽 / 回调传入。
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

  const hasQuery = query.trim() !== ''

  return (
    <SearchReplacePopup
      open={open}
      onClose={onClose}
      title={t('search.title')}
      ariaLabel={t('search.aria')}
      ariaClose={t('search.close')}
      query={query}
      replacement={replacement}
      onQueryChange={setQuery}
      onReplacementChange={setReplacement}
      placeholderSearch={t('search.placeholderSearch')}
      placeholderReplace={t('search.placeholderReplace')}
      ariaSearch={t('search.ariaSearch')}
      ariaReplace={t('search.ariaReplace')}
      headStatus={
        <span className="ep-search-count">
          {!hasQuery
            ? ''
            : total === 0
              ? t('search.none')
              : t('search.count', { index: activeIndex + 1, total })}
        </span>
      }
      onSearchKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          if (event.shiftKey) prev()
          else next()
        }
      }}
      actions={
        <>
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
        </>
      }
    >
      {hasQuery && total === 0 ? (
        <div className="ep-search-empty">{t('search.noMatch')}</div>
      ) : null}
    </SearchReplacePopup>
  )
}
