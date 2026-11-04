import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ForeshadowAnchor,
  ForeshadowAnchorKind,
  ForeshadowRow
} from '../../../../main/database/foreshadows'
import { Button, Modal, SearchInput } from '../ui'
// 列表行 / 空态样式与「回收伏笔」弹窗完全一致（同一套行高、halo 卡与滚动容器），
// 直接复用其样式表，避免复制一份平行 CSS（AGENTS §9）；类名带 recover 前缀为历史命名。
import '../../styles/components/foreshadow-recover-dialog.css'

/** 关联失败原因（`error` = IPC 抛错 / 网络层失败，其余来自数据层结构化拒绝）。 */
export type AttachForeshadowFailureReason = 'full' | 'invalid' | 'notFound' | 'error'

export interface ForeshadowAnchorAttachDialogProps {
  /** 书籍 id（列出全书可挂大纲埋点 / 正文埋点的伏笔）。 */
  bookId: string
  /** 当前选区快照锚点（章节 / 大纲条目；`none` = 无锚点载体 → 列表为空）。 */
  anchor: ForeshadowAnchor
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 关联成功（由父级 toast + 关闭 + 刷新标记）。 */
  onAttached: () => void
  /** 关联失败（由父级按原因 toast；弹窗保持打开，选中项得以保留可重试）。 */
  onFailed: (reason: AttachForeshadowFailureReason) => void
}

/**
 * 候选判定：与数据层 `attachForeshadowAnchor` 的落槽规则逐条对齐（**仅用于列表过滤**，
 * 提交仍由数据层终审；行可能在弹窗打开期间被别处改动，故失败分支照常处理）：
 *
 * - 锚点须为 `chapter` / `outline`（`none` 无意义 → 数据层返回 `invalid`，此处不列任何项）；
 * - 槽位由锚点 `kind` 决定：`chapter` → 正文埋点（`body_*`）、`outline` → 大纲埋点
 *   （`outline_*`）；目标槽位已占用 → 数据层返回 `full`，不列。
 */
function canAttachForeshadow(row: ForeshadowRow, kind: ForeshadowAnchorKind): boolean {
  if (kind === 'chapter') return row.bodyKind === 'none'
  if (kind === 'outline') return row.outlineKind === 'none'
  return false
}

/**
 * 「关联伏笔」弹窗（正文右键「关联伏笔」入口）：把当前选区挂成某条伏笔的
 * **正文埋点 / 大纲埋点**（槽位由选区锚点的 `kind` 决定）。
 *
 * - 结构自上而下：搜索框 → 候选列表 → 底部「取消 / 关联」；
 * - 候选 = 全书「还能挂上当前选区类型」的伏笔（见 {@link canAttachForeshadow}）：
 *   目标槽位为空（章节选区 → 正文槽空；大纲选区 → 大纲槽空）；
 * - **先选后提**：列表点击只选中（`aria-selected` + 通用光晕 `.is-active`），
 *   点「关联」才调 `foreshadow.attachAnchor(id, anchor)`；
 * - 未选中任何条目时「关联」按钮禁用；
 * - 文案全部走 `foreshadow` ns；加载文案复用 `common.loading`。
 */
export default function ForeshadowAnchorAttachDialog({
  bookId,
  anchor,
  onClose,
  onAttached,
  onFailed
}: ForeshadowAnchorAttachDialogProps): ReactNode {
  const { t } = useTranslation('foreshadow')
  const { t: tCommon } = useTranslation('common')
  const [rows, setRows] = useState<ForeshadowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点交给搜索框。
  useEffect(() => {
    const id = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  // 打开时拉全书伏笔，只保留当前锚点类型还能挂上的项（软删除已由 `foreshadow.list` 过滤）。
  // 状态初始化放在 useState 初值（弹窗按 `bookId` 挂 key 重挂，切换书即重置）；
  // 不在 effect 体内同步 setState，避免级联渲染（react-hooks/set-state-in-effect）。
  useEffect(() => {
    let cancelled = false
    window.api.foreshadow
      .list(bookId)
      .then((all) => {
        if (cancelled) return
        setRows(all.filter((row) => canAttachForeshadow(row, anchor.kind)))
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setRows([])
        setLoadFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, anchor.kind])

  /** 按名称模糊过滤（大小写不敏感）。 */
  const visibleRows = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (keyword === '') return rows
    return rows.filter((row) => row.title.toLowerCase().includes(keyword))
  }, [rows, query])

  const canSubmit = selectedId !== null && !submitting

  const submit = async (): Promise<void> => {
    if (selectedId === null || submitting) return
    setSubmitting(true)
    try {
      const result = await window.api.foreshadow.attachAnchor(selectedId, anchor)
      if (!result.ok) {
        onFailed(result.reason)
        setSubmitting(false)
        return
      }
      onAttached()
    } catch {
      onFailed('error')
      setSubmitting(false)
    }
  }

  const renderList = (): ReactNode => {
    if (loading) {
      return <div className="foreshadow-recover-note">{tCommon('loading')}</div>
    }
    if (loadFailed) {
      return <div className="foreshadow-recover-note">{t('attach.loadFailed')}</div>
    }
    if (rows.length === 0) {
      return <div className="foreshadow-recover-note">{t('attach.empty')}</div>
    }
    if (visibleRows.length === 0) {
      return <div className="foreshadow-recover-note">{t('attach.noResult')}</div>
    }
    return visibleRows.map((row) => {
      const selected = row.id === selectedId
      return (
        <button
          key={row.id}
          type="button"
          role="option"
          aria-selected={selected}
          className={`foreshadow-recover-item wf-card--halo${selected ? ' is-active' : ''}`}
          onClick={() => setSelectedId(row.id)}
        >
          <span className="foreshadow-recover-item__title">
            {row.title.trim() === '' ? t('field.untitled') : row.title}
          </span>
        </button>
      )
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('attach.title')}
      size="sm"
      ariaLabel={t('attach.title')}
      footer={
        <>
          <Button variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void submit()}
          >
            {t('attach.submit')}
          </Button>
        </>
      }
    >
      <div className="foreshadow-recover-dialog">
        <SearchInput
          ref={searchRef}
          value={query}
          placeholder={t('attach.searchPlaceholder')}
          aria-label={t('attach.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onClear={() => setQuery('')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {/* 列表容器固定最大高度并内部滚动：全书伏笔很多时不撑破弹窗。
            `role="listbox"` + 选项按钮 `role="option"` 供读屏识别选中态。 */}
        <div className="foreshadow-recover-list" role="listbox" aria-label={t('attach.listLabel')}>
          {renderList()}
        </div>
      </div>
    </Modal>
  )
}
