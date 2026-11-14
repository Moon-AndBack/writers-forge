import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ForeshadowAnchor } from '../../../../../main/database/foreshadows'
import { Button, FormField, Input, Modal, Textarea } from '../../../components/ui'
import ForeshadowDescriptionField from './ForeshadowDescriptionField'
import '../../../styles/components/foreshadow-create-dialog.css'

export interface ForeshadowCreateDialogProps {
  /** 书籍 id（`foreshadow.create` 的所属书，锚点目标须同书）。 */
  bookId: string
  /** 右键快照构造出的锚点（章节 / 大纲条目 / 未锚定）。 */
  anchor: ForeshadowAnchor
  /** 名称可选初值（正文右键场景传空串：名称一律由用户自行输入）。 */
  defaultTitle: string
  /** 关联位置展示串（如「第一卷 · 第三章」）；空串 → 展示「未关联」。 */
  contextLabel: string
  /**
   * 选中文字 = 锚点 `quote.slice(charStart, charEnd)`（区间不可用时回退整段 `quote`）；
   * 空串 → 展示占位。整段快照只用于失效判定，不在此展示。
   */
  selectedText: string
  /** 关闭（取消 / 遮罩 / Esc / 关闭按钮）。 */
  onClose: () => void
  /**
   * 创建成功（由父级负责 toast + 关闭）。
   * 提示不能留在弹窗内部：成功后弹窗卸载，挂在弹窗内的 toast 节点会随之消失。
   */
  onCreated: () => void
  /** 创建失败（由父级 toast；弹窗保持打开，输入得以保留可重试）。 */
  onFailed: () => void
}

/**
 * 「新建伏笔」弹窗（正文右键「添加伏笔」与标题栏「新建」共用）。
 *
 * 位于伏笔域（`pages/writer/foreshadow`）：描述字段需要实体高亮 / 悬停（页面层实体域），
 * 放在 `components/dialogs` 会让共享层反向依赖页面层。
 *
 * - 字段顺序：名称（必填，用户输入）/ 关联（只读）/ 选中文字（只读）/ 描述（可选富文本，
 *   仅实体自动高亮）；
 *   不写状态（落库默认 `planted`，展示状态由锚点派生，本批只做埋设入口）；
 * - 锚点可为 `chapter` / `outline` / `none`：未锚定（标题栏新建）时「关联」显示「未关联」、
 *   「选中文字」为空，创建后不落任何埋点槽位，可由正文 / 大纲右键「关联伏笔」补挂；
 * - 提交直接调 `window.api.foreshadow.create`：成功 → `onCreated`；返回 null / 抛错 →
 *   `onFailed`，**不关闭**弹窗；
 * - 文案全部走 `foreshadow` ns；按钮 `onMouseDown` 阻止默认，与编辑器菜单同口径
 *   （弹窗打开时选区已快照，不夺焦以免破坏编辑器选区语义）。
 */
export default function ForeshadowCreateDialog({
  bookId,
  anchor,
  defaultTitle,
  contextLabel,
  selectedText,
  onClose,
  onCreated,
  onFailed
}: ForeshadowCreateDialogProps) {
  const { t } = useTranslation('foreshadow')
  const [title, setTitle] = useState(defaultTitle)
  // 富文本描述真源（JSON；`null` = 空描述，主进程据此派生纯文本摘要列）。
  const [descriptionJson, setDescriptionJson] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Modal 挂载时会把焦点移到面板，延后一帧把焦点夺回名称输入框。
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  const trimmedTitle = title.trim()
  const canSubmit = trimmedTitle !== '' && !submitting

  const submit = async (): Promise<void> => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const row = await window.api.foreshadow.create(bookId, {
        title: trimmedTitle,
        // 富文本真源；主进程据 JSON 派生 `description` 纯文本摘要（两列同写）。
        descriptionJson,
        // 不传 `status`：数据层缺省即 `'planted'`（未废弃），状态一律由锚点派生。
        // 属性名即槽位：章节锚点 → 正文埋点（`anchor`），大纲锚点 → 大纲埋点（`anchor2`）；
        // 未锚定（`kind: 'none'`，标题栏「新建」）不传槽位 → 两列均落 `'none'`。
        ...(anchor.kind === 'outline'
          ? { anchor2: anchor }
          : anchor.kind === 'chapter'
            ? { anchor }
            : {})
      })
      if (row === null) {
        onFailed()
        setSubmitting(false)
        return
      }
      onCreated()
    } catch {
      onFailed()
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('dialog.createTitle')}
      size="sm"
      ariaLabel={t('dialog.createTitle')}
      footer={
        <>
          <Button
            variant="secondary"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClose}
          >
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            loading={submitting}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void submit()}
          >
            {t('action.save')}
          </Button>
        </>
      }
    >
      <div className="foreshadow-create-dialog">
        <FormField label={t('field.name')} htmlFor="foreshadow-create-name" required>
          <Input
            ref={inputRef}
            id="foreshadow-create-name"
            value={title}
            placeholder={t('field.namePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </FormField>
        <FormField label={t('field.context')} htmlFor="foreshadow-create-context">
          <Input
            id="foreshadow-create-context"
            readOnly
            tabIndex={-1}
            value={contextLabel === '' ? t('field.contextUnlinked') : contextLabel}
            spellCheck={false}
          />
        </FormField>
        <FormField label={t('field.selectedText')} htmlFor="foreshadow-create-selected-text">
          <Textarea
            id="foreshadow-create-selected-text"
            rows={2}
            readOnly
            tabIndex={-1}
            value={selectedText}
            placeholder={t('field.selectedTextEmpty')}
          />
        </FormField>
        <FormField label={t('field.description')}>
          {/* 弹窗内不启用实体悬停卡：Modal 的 z-index（1000）高于悬停卡
              `--z-hover-card`（970），卡片会被遮罩挡住；高亮仍照常生效。 */}
          <ForeshadowDescriptionField
            bookId={bookId}
            initialJson={null}
            placeholder={t('field.descriptionPlaceholder')}
            ariaLabel={t('field.description')}
            onChange={(value) => setDescriptionJson(value.json)}
          />
        </FormField>
      </div>
    </Modal>
  )
}
