/**
 * 灵感右栏详情：标题 + 纯文本正文 + 标签编辑 + 底部保存条。
 *
 * 保存口径与伏笔 / 剧情 / 设定档案一致：
 * - 表单只改本地草稿，点保存条才组装「仅变更字段」补丁落库；
 * - 脏态经 `onDirtyChange` 上报（保存按钮 + 切换守卫共用），`saveRef` 挂载时写入
 *   `saveNow`（域内切换确认 / 关闭前 flush / 切模块兜底调用）；
 * - ⚠️ 卸载时**不注销** `saveRef`：右栏条件挂载，切模块时先卸载表单、后执行装配清理，
 *   workspace 仍需取到最后一笔草稿做自动保存兜底；
 * - 删除入口只在中栏卡片（`InspirationView` 持确认框），右栏不提供删除，故本文件无删除相关状态。
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { ChipInput, FormField, Input, Textarea, useToast } from '../../../components/ui'
import SaveBar from '../SaveBar'
import { PRESET_INSPIRATION_TAGS } from './inspirationPresets'
import {
  buildInspirationPatch,
  createInspirationDraft,
  INSPIRATION_MAX_TAGS,
  type InspirationBundle,
  type InspirationDraft,
  type InspirationRow,
  type InspirationUpdatePatch
} from './inspirationTree'

export interface InspirationPanelProps {
  bundle: InspirationBundle
}

export default function InspirationPanel({ bundle }: InspirationPanelProps) {
  const { t } = useTranslation('inspiration')
  const row = bundle.activeRow
  const { onDirtyChange } = bundle

  // 空态（无选中条目 / 条目被删）= 无草稿：上报净态，避免切走后守卫仍持过期脏标记。
  useEffect(() => {
    if (row === null) onDirtyChange(false)
  }, [row, onDirtyChange])

  return row === null ? (
    <EmptyState compact title={t('detail.emptyTitle')} description={t('detail.emptyDesc')} />
  ) : (
    <InspirationPanelForm
      key={`${row.id}-${bundle.draftResetKey}`}
      row={row}
      onUpdate={bundle.onUpdate}
      onDirtyChange={bundle.onDirtyChange}
      saveRef={bundle.saveRef}
    />
  )
}

interface InspirationPanelFormProps {
  row: InspirationRow
  onUpdate: (id: number, patch: InspirationUpdatePatch) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
}

/** 单条编辑表单（按 `row.id + draftResetKey` 重建，内部持草稿；手动保存 + 脏态上报）。 */
function InspirationPanelForm({
  row,
  onUpdate,
  onDirtyChange,
  saveRef
}: InspirationPanelFormProps) {
  const { t } = useTranslation('inspiration')
  const fieldId = useId()
  const { show: showToast, node: toastNode } = useToast()

  const [draft, setDraft] = useState<InspirationDraft>(() => createInspirationDraft(row))
  const [saving, setSaving] = useState(false)

  const patch = useMemo(() => buildInspirationPatch(row, draft), [row, draft])
  const changed = Object.keys(patch).length > 0

  // 手动保存：仅落变更字段；无改动为空操作（与按钮禁用态同口径）。
  // 失败时脏态保留、按钮可再次点击重试。
  const saveNow = useCallback((): void | Promise<boolean> => {
    if (!changed) return undefined
    setSaving(true)
    return Promise.resolve(onUpdate(row.id, patch))
      .catch(() => false)
      .finally(() => setSaving(false))
  }, [changed, onUpdate, row.id, patch])

  // 上报脏态 + 注册保存入口。⚠️ 卸载时不注销 `saveRef`（见文件头）。
  useEffect(() => {
    onDirtyChange(changed)
    saveRef.current = saveNow
  }, [changed, onDirtyChange, saveNow, saveRef])

  /** 保存条按钮：显式点击才提示成败（切换确认 / 关闭前 flush 走 `saveNow`，静默）。 */
  const handleSave = useCallback((): void => {
    void Promise.resolve(saveNow()).then((ok) => {
      if (ok === false) showToast(t('toast.saveFailed'))
      else if (ok === true) showToast(t('toast.saveSuccess'))
    })
  }, [saveNow, showToast, t])

  return (
    <div className="inspiration-panel">
      <div className="inspiration-panel__scroll">
        <div className="inspiration-fields on-soft">
          <FormField label={t('field.title')} htmlFor={`${fieldId}-title`}>
            <Input
              id={`${fieldId}-title`}
              value={draft.title}
              placeholder={t('field.titlePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </FormField>

          {/* 正文是块内唯一伸缩项：吃掉右栏剩余高度，内容超高时由 textarea 自身滚动。 */}
          <FormField
            className="inspiration-fields__content"
            label={t('field.content')}
            htmlFor={`${fieldId}-content`}
          >
            <Textarea
              id={`${fieldId}-content`}
              className="inspiration-content"
              value={draft.content}
              placeholder={t('field.contentPlaceholder')}
              spellCheck={false}
              onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
            />
          </FormField>

          <FormField
            label={t('field.tags')}
            htmlFor={`${fieldId}-tags`}
            hint={t('field.tagsHint', { max: INSPIRATION_MAX_TAGS })}
          >
            <ChipInput
              id={`${fieldId}-tags`}
              value={draft.tags}
              max={INSPIRATION_MAX_TAGS}
              placeholder={t('field.tagsPlaceholder')}
              ariaLabel={t('field.tags')}
              suggestions={PRESET_INSPIRATION_TAGS}
              onChange={(tags) => setDraft((prev) => ({ ...prev, tags }))}
            />
          </FormField>
        </div>
      </div>

      <SaveBar
        className="inspiration-save-bar"
        dirty={changed}
        saving={saving}
        onSave={handleSave}
      />

      {toastNode}
    </div>
  )
}
