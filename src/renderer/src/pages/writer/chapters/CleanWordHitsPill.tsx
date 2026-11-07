import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Tag } from '../../../components/ui'
import { CATEGORY_LABEL_KEYS } from '../../../components/dialogs/cleanWordsMeta'
import { setCleanWordsDialogOpen } from '../../../components/dialogs/cleanWordsDialogStore'
import { requestCleanWordFlash, useProofreadHits } from './proofreadHits'
import type { ProofreadHitsSnapshot } from './proofreadHits'

/**
 * 状态栏「违禁词命中」胶囊（章节模块 `left` 插槽）：**自包含**订阅 + 弹层。
 *
 * 从 `useChapterStatusBar` 拆出的原因：计数 / 弹层开关若留在页面级 `slots` 的
 * useMemo 依赖里，每次计数变化或弹窗开合都会换掉 `slots` 引用，触发
 * `useSetModuleStatusBar` 先 cleanup（置 null）再重注册，状态栏会瞬间空一段。
 * 下沉后 slots 只随「章节位置」变化，计数变化只重渲染本组件。
 *
 * 口径：
 * - `0` 处渲染**静态** `<span>`（非 button）：没有可执行动作，不给虚假的可交互语义，
 *   也不进入 Tab 序列（`disabled` button 仍会被读屏播报为「不可用按钮」）；
 * - `> 0` 渲染按钮，点击向上弹出**本章命中清单**（词 + 类别 + 次数），
 *   Esc / 指针落在根节点外 / 打开词库时关闭；
 * - 清单每行是按钮：点击请求正文闪烁该词的全部命中，弹层保持打开便于连续核对；
 * - 弹层视觉底座复用 `.st-popup`，`right: 0` 改为 `left: 0`（胶囊在最左，向右展开
 *   才不会越出窗口），样式见 `styles/clean-word-hits.css`；
 * - 全局词库入口保留在弹层底部（`setCleanWordsDialogOpen`），不直接占据胶囊点击。
 */
export default function CleanWordHitsPill(): ReactElement {
  const { t } = useTranslation('chapters')
  const snapshot = useProofreadHits()
  const { total, groups } = snapshot
  const [openSnapshot, setOpenSnapshot] = useState<ProofreadHitsSnapshot | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // 展开态绑定「打开时的快照」：命中内容变化（清零 / 切章 / 增删命中）自动收起，
  // 既避免 0 态残留展开态，也无需在 effect 里同步 state。
  const open = openSnapshot === snapshot

  // 开合范式对齐 PopupSelect：展开期间 Esc 关闭 + 指针落在根节点外关闭。
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenSnapshot(null)
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpenSnapshot(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (total === 0) {
    return (
      <span className="st-pill-btn wf-clean-count is-zero" title={t('proofread.hitsTitle')}>
        {t('proofread.hits', { count: 0 })}
      </span>
    )
  }

  return (
    <div className="st-pill-wrap" ref={rootRef}>
      <button
        type="button"
        className={`st-pill-btn wf-clean-count${open ? ' is-open' : ''}`}
        title={t('proofread.hitsTitle')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('cleanWords.statusBarAria', { hits: total })}
        onClick={() => setOpenSnapshot((prev) => (prev === snapshot ? null : snapshot))}
      >
        {t('proofread.hits', { count: total })}
      </button>

      {open ? (
        <div
          className="st-popup wf-clean-pop"
          role="dialog"
          aria-label={t('cleanWords.hitListTitle', { total, words: groups.length })}
        >
          <div className="wf-clean-pop__title">
            {t('cleanWords.hitListTitle', { total, words: groups.length })}
          </div>
          <ul className="wf-clean-pop__list">
            {groups.map((group) => (
              <li key={`${group.category}:${group.word}`}>
                <button
                  type="button"
                  className="wf-clean-pop__row"
                  title={group.word}
                  onClick={() => requestCleanWordFlash(group.word)}
                >
                  <span className="wf-clean-pop__word">{group.word}</span>
                  <Tag className="wf-clean-pop__tag">{t(CATEGORY_LABEL_KEYS[group.category])}</Tag>
                  <span className="wf-clean-pop__times">
                    {t('cleanWords.hitTimes', { count: group.count })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="st-popup-item wf-clean-pop__open"
            onClick={() => {
              setOpenSnapshot(null)
              setCleanWordsDialogOpen(true)
            }}
          >
            {t('cleanWords.openLibrary')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
