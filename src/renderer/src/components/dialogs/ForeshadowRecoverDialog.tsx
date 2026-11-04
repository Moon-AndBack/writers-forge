import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ForeshadowAnchor,
  ForeshadowRow,
  ForeshadowStatus
} from '../../../../main/database/foreshadows'
import { Button, FormField, Modal, SearchInput, Tag, Textarea } from '../ui'
import type { TagTone } from '../ui'
import '../../styles/components/foreshadow-recover-dialog.css'

/**
 * 状态 → i18n key / 胶囊色调。
 *
 * §9 说明：`pages/writer/foreshadow/foreshadowTree.ts` 有同名映射，但那是**页面层**模块，
 * 共享组件不得反向依赖页面；两条映射均为一对一常量（键与数据层枚举逐字一致），
 * 复制成本极低且无逻辑，故此处独立登记（差异无法通过参数表达）。
 */
const STATUS_LABEL_KEYS = {
  planted: 'status.planted',
  recovered: 'status.recovered',
  abandoned: 'status.abandoned'
} as const satisfies Record<ForeshadowStatus, string>

const STATUS_TONES: Record<ForeshadowStatus, TagTone> = {
  planted: 'brand',
  recovered: 'ok',
  abandoned: 'neutral'
}

export interface ForeshadowRecoverDialogProps {
  /** 书籍 id（列出全书埋设中伏笔）。 */
  bookId: string
  /**
   * 回收点锚点：父亲在点「回收伏笔」时取自正文选区快照（章节 / 大纲条目 / 未锚定）。
   * 回收提交时随 `status` / `recoveryNote` 一并落库，回收处据此铺设「回收点」标记。
   */
  recoverAnchor: ForeshadowAnchor
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /** 回收成功（参数为被回收的伏笔 id；由父级负责 toast / 关闭 / 刷新）。 */
  onRecovered: (id: number) => void
  /** 回收失败（由父级 toast；弹窗保持打开，选中与备注得以保留可重试）。 */
  onFailed: () => void
}

/**
 * 「回收伏笔」弹窗（正文右键「回收伏笔」入口）。
 *
 * - 结构自上而下：搜索框 → 全书**埋设中**（`planted`）伏笔列表 → 回收备注 → 底部「取消 / 回收」；
 * - **先选后收**：列表点击只选中（`aria-selected` + 通用光晕 `.is-active`），
 *   点「回收」按钮才真正调用 `foreshadow.update(id, { status: 'recovered', recoveryNote, recoverAnchor })`；
 * - 未选中任何条目时「回收」按钮禁用；
 * - 备注可选（空串 = 无备注），提交时 `trim()` 后落库；
 * - 文案全部走 `foreshadow` ns；加载文案复用 `common.loading`。
 */
export default function ForeshadowRecoverDialog({
  bookId,
  recoverAnchor,
  onClose,
  onRecovered,
  onFailed
}: ForeshadowRecoverDialogProps): ReactNode {
  const { t } = useTranslation('foreshadow')
  const { t: tCommon } = useTranslation('common')
  const [rows, setRows] = useState<ForeshadowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点交给搜索框。
  useEffect(() => {
    const id = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  // 打开时拉全书伏笔，只保留可回收项（**仅**埋设中 `status === 'planted'`；
  // 已回收 / 已放弃均不可再回收）。
  // 软删除已由 `foreshadow.list` 在数据层过滤，此处无需再判 `deletedAt`。
  // 状态初始化放在 useState 初值（弹窗按 `bookId` 挂 key 重挂，切换书即重置）；
  // 不在 effect 体内同步 setState，避免级联渲染（react-hooks/set-state-in-effect）。
  useEffect(() => {
    let cancelled = false
    window.api.foreshadow
      .list(bookId)
      .then((all) => {
        if (cancelled) return
        setRows(all.filter((row) => row.status === 'planted'))
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
  }, [bookId])

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
      const updated = await window.api.foreshadow.update(selectedId, {
        status: 'recovered',
        recoveryNote: note.trim(),
        recoverAnchor
      })
      if (updated === null) {
        onFailed()
        setSubmitting(false)
        return
      }
      onRecovered(selectedId)
    } catch {
      onFailed()
      setSubmitting(false)
    }
  }

  const renderList = (): ReactNode => {
    if (loading) {
      return <div className="foreshadow-recover-note">{tCommon('loading')}</div>
    }
    if (loadFailed) {
      return <div className="foreshadow-recover-note">{t('recover.loadFailed')}</div>
    }
    if (rows.length === 0) {
      return <div className="foreshadow-recover-note">{t('recover.empty')}</div>
    }
    if (visibleRows.length === 0) {
      return <div className="foreshadow-recover-note">{t('recover.noResult')}</div>
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
          <Tag tone={STATUS_TONES[row.status]}>{t(STATUS_LABEL_KEYS[row.status])}</Tag>
        </button>
      )
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('recover.title')}
      size="sm"
      ariaLabel={t('recover.title')}
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
            {t('recover.submit')}
          </Button>
        </>
      }
    >
      <div className="foreshadow-recover-dialog">
        <SearchInput
          ref={searchRef}
          value={query}
          placeholder={t('recover.searchPlaceholder')}
          aria-label={t('recover.searchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          onClear={() => setQuery('')}
          onChange={(event) => setQuery(event.target.value)}
        />
        {/* 列表容器固定最大高度并内部滚动：全书伏笔很多时不撑破弹窗。
            `role="listbox"` + 选项按钮 `role="option"` 供读屏识别选中态。 */}
        <div className="foreshadow-recover-list" role="listbox" aria-label={t('recover.listLabel')}>
          {renderList()}
        </div>
        <FormField label={t('recover.noteLabel')} htmlFor="foreshadow-recover-note">
          <Textarea
            id="foreshadow-recover-note"
            rows={3}
            value={note}
            placeholder={t('recover.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  )
}
