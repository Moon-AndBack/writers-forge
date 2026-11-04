/**
 * 伏笔右栏详情：四块独立底色卡 ——
 * ① 可编辑块：名称 / 状态 / 描述（草稿态）；
 * ② 只读块：埋点位置 + 原文摘抄；
 * ③ 只读块：回收位置 + 原文摘抄 + 回收备注；
 * ④ 底部固定保存条。
 * 删除入口只在卡片上（中栏 `ForeshadowView`），右栏不再提供。
 *
 * 保存口径与剧情 / 设定档案一致：
 * - 表单只改本地草稿，点保存条才组装「仅变更字段」补丁落库；
 * - 脏态经 `onDirtyChange` 上报（保存按钮 + 切换守卫共用），`saveRef` 挂载时写入
 *   `saveNow`（域内切换确认 / 关闭前 flush / 切模块兜底调用）；
 * - ⚠️ 卸载时**不注销** `saveRef`：右栏条件挂载，切模块时先卸载表单、后执行装配清理，
 *   workspace 仍需取到最后一笔草稿做自动保存兜底。
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { FormField, Input, Select, Textarea, Button, useToast } from '../../../components/ui'
import SaveBar from '../SaveBar'
import ConfirmDialog from '../ConfirmDialog'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import type { OutlineItemRow } from '../outline/outlineTree'
import ForeshadowAnchorBlock from './ForeshadowAnchorBlock'
import {
  buildForeshadowPatch,
  createForeshadowDraft,
  FORESHADOW_STATUSES,
  FORESHADOW_STATUS_LABEL_KEYS,
  resolveForeshadowAnchor,
  resolveForeshadowAnchor2,
  resolveForeshadowRecoverAnchor,
  type ForeshadowBundle,
  type ForeshadowDraft,
  type ForeshadowRow,
  type ForeshadowStatus,
  type ForeshadowUpdatePatch
} from './foreshadowTree'

export interface ForeshadowPanelProps {
  bundle: ForeshadowBundle
  /** 未删除章（解析章节锚点目标名 / 失效判定）。 */
  chapters: readonly ChapterRow[]
  /** 章节页可见卷（补全章节锚点的「卷 · 章」完整位置）。 */
  volumes: readonly VolumeRow[]
  /** 未删除大纲条目（解析大纲锚点目标名 / 失效判定）。 */
  outlineItems: readonly OutlineItemRow[]
}

export default function ForeshadowPanel({
  bundle,
  chapters,
  volumes,
  outlineItems
}: ForeshadowPanelProps) {
  const { t } = useTranslation('foreshadow')
  const row = bundle.activeRow
  const { onDirtyChange } = bundle

  // 空态（无选中条目 / 条目被删）= 无草稿：上报净态，避免切走后守卫仍持过期脏标记。
  useEffect(() => {
    if (row === null) onDirtyChange(false)
  }, [row, onDirtyChange])

  if (row === null) {
    return (
      <div className="placeholder-view is-compact" role="note">
        <div className="placeholder-title">{t('detail.emptyTitle')}</div>
        <div className="placeholder-desc">{t('detail.emptyDesc')}</div>
      </div>
    )
  }

  return (
    <ForeshadowPanelForm
      key={`${row.id}-${bundle.draftResetKey}`}
      row={row}
      chapters={chapters}
      volumes={volumes}
      outlineItems={outlineItems}
      onUpdate={bundle.onUpdate}
      onDirtyChange={bundle.onDirtyChange}
      saveRef={bundle.saveRef}
    />
  )
}

interface ForeshadowPanelFormProps {
  row: ForeshadowRow
  chapters: readonly ChapterRow[]
  volumes: readonly VolumeRow[]
  outlineItems: readonly OutlineItemRow[]
  onUpdate: (id: number, patch: ForeshadowUpdatePatch) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
}

/** 单条编辑表单（按 `row.id + draftResetKey` 重建，内部持草稿；手动保存 + 脏态上报）。 */
function ForeshadowPanelForm({
  row,
  chapters,
  volumes,
  outlineItems,
  onUpdate,
  onDirtyChange,
  saveRef
}: ForeshadowPanelFormProps) {
  const { t } = useTranslation('foreshadow')
  const fieldId = useId()

  const [draft, setDraft] = useState<ForeshadowDraft>(() => createForeshadowDraft(row))
  const [saving, setSaving] = useState(false)
  /** 非 null = 「移除大纲埋点」二次确认打开。 */
  const [removeAnchor2Open, setRemoveAnchor2Open] = useState(false)
  const [removingAnchor2, setRemovingAnchor2] = useState(false)
  const { show: showToast, node: toastNode } = useToast()

  const patch = useMemo(() => buildForeshadowPatch(row, draft), [row, draft])
  const changed = Object.keys(patch).length > 0
  const titleEmpty = draft.title.trim() === ''

  const statusOptions = useMemo(
    () =>
      FORESHADOW_STATUSES.map((value) => ({
        value,
        label: t(FORESHADOW_STATUS_LABEL_KEYS[value])
      })),
    [t]
  )

  // 手动保存：仅落变更字段；无改动为空操作（与按钮禁用态同口径）。
  // 失败时脏态保留、按钮可再次点击重试；提示口径与剧情 / 设定档案一致（不在表单内弹 toast）。
  const saveNow = useCallback((): void | Promise<boolean> => {
    if (!changed) return undefined
    if (titleEmpty) return Promise.resolve(false)
    setSaving(true)
    return Promise.resolve(onUpdate(row.id, patch))
      .catch(() => false)
      .finally(() => setSaving(false))
  }, [changed, titleEmpty, onUpdate, row.id, patch])

  // 上报脏态 + 注册保存入口。⚠️ 卸载时不注销 `saveRef`（见文件头）。
  useEffect(() => {
    onDirtyChange(changed)
    saveRef.current = saveNow
  }, [changed, onDirtyChange, saveNow, saveRef])

  const plantResolution = useMemo(
    () => resolveForeshadowAnchor(row, chapters, volumes, outlineItems),
    [row, chapters, volumes, outlineItems]
  )
  // 大纲埋点仅在已使用大纲槽位时解析 / 渲染（`none` → 不占右栏空间）。
  const plant2Resolution = useMemo(
    () =>
      row.outlineKind === 'none'
        ? null
        : resolveForeshadowAnchor2(row, chapters, volumes, outlineItems),
    [row, chapters, volumes, outlineItems]
  )
  const recoverResolution = useMemo(
    () => resolveForeshadowRecoverAnchor(row, chapters, volumes, outlineItems),
    [row, chapters, volumes, outlineItems]
  )

  /**
   * 移除大纲埋点：清空 `outline_*`（数据层 `anchor2: null`）。落库成功由 bundle
   * 广播标记刷新，正文 / 大纲的大纲埋点标记随之消失；提示沿用通用的保存成功 / 失败口径。
   */
  const removeAnchor2 = useCallback(async (): Promise<void> => {
    setRemovingAnchor2(true)
    const ok = await onUpdate(row.id, { anchor2: null })
    setRemovingAnchor2(false)
    setRemoveAnchor2Open(false)
    showToast(ok ? t('toast.updateSuccess') : t('toast.updateFailed'))
  }, [onUpdate, row.id, showToast, t])

  return (
    <div className="foreshadow-panel">
      <div className="foreshadow-panel__scroll">
        {/* `on-soft`：本块为 --soft-solid 底色，内部输入控件需换用 --control-on-soft
            令牌，否则控件与卡片同色、边界不可辨（见 form.css）。 */}
        <div className="foreshadow-fields on-soft">
          <FormField
            label={t('field.name')}
            htmlFor={`${fieldId}-title`}
            required
            error={titleEmpty ? t('field.nameRequired') : undefined}
          >
            <Input
              id={`${fieldId}-title`}
              value={draft.title}
              placeholder={t('field.namePlaceholder')}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
            />
          </FormField>

          <FormField label={t('field.status')} htmlFor={`${fieldId}-status`}>
            <Select
              id={`${fieldId}-status`}
              value={draft.status}
              options={statusOptions}
              onChange={(value) =>
                setDraft((prev) => ({ ...prev, status: value as ForeshadowStatus }))
              }
            />
          </FormField>

          {/* 描述字段是块内唯一伸缩项：外层 FormField 撑满可编辑块剩余高度，
              Textarea 随之拉满（`rows` 只提供无余量时的固有高度下限，实际高度由
              writer-foreshadow.css 的 flex 规则决定）。 */}
          <FormField
            className="foreshadow-fields__desc"
            label={t('field.description')}
            htmlFor={`${fieldId}-description`}
          >
            <Textarea
              id={`${fieldId}-description`}
              rows={5}
              value={draft.description}
              placeholder={t('field.descriptionPlaceholder')}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </FormField>
        </div>

        <ForeshadowAnchorBlock
          label={t('detail.plant')}
          resolution={plantResolution}
          quote={row.bodyQuote}
          emptyText={t('detail.plantEmpty')}
        />

        {/* 大纲埋点：仅在已使用大纲槽位时渲染（与中栏卡同口径，不占空块）。
            移除属破坏性操作，走通用 ConfirmDialog 二次确认后再清空 `outline_*`。 */}
        {plant2Resolution === null ? null : (
          <ForeshadowAnchorBlock
            label={t('detail.plant2')}
            resolution={plant2Resolution}
            quote={row.outlineQuote}
            emptyText={t('detail.plantEmpty')}
            action={
              <Button variant="ghost" size="sm" onClick={() => setRemoveAnchor2Open(true)}>
                {t('detail.plant2Remove')}
              </Button>
            }
          />
        )}

        <ForeshadowAnchorBlock
          label={t('detail.recover')}
          resolution={recoverResolution}
          quote={row.recoverQuote}
          emptyText={t('detail.recoverEmpty')}
          note={{ label: t('detail.recoverNote'), value: row.recoveryNote }}
        />
      </div>

      <SaveBar
        className="foreshadow-save-bar"
        dirty={changed && !titleEmpty}
        saving={saving}
        onSave={saveNow}
      />

      {removeAnchor2Open ? (
        <ConfirmDialog
          open
          title={t('dialog.removeAnchor2.title')}
          message={t('dialog.removeAnchor2.message')}
          confirmText={t('dialog.removeAnchor2.confirm')}
          confirming={removingAnchor2}
          onConfirm={() => {
            void removeAnchor2()
          }}
          onClose={() => {
            if (!removingAnchor2) setRemoveAnchor2Open(false)
          }}
        />
      ) : null}

      {toastNode}
    </div>
  )
}
