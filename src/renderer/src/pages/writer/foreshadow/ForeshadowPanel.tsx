/**
 * 伏笔右栏详情：四块独立底色卡 ——
 * ① 可编辑块：名称 / 描述（富文本草稿态，仅实体自动高亮）；状态由中栏卡片胶囊展示，右栏不重复；
 * ② 只读块：正文埋点位置 + 原文摘抄（可移除）；
 * ③ 只读块：大纲埋点位置 + 原文摘抄（可移除）；
 * ④ 只读块：回收位置 + 原文摘抄 + 回收备注（可移除）；
 * ⑤ 底部固定保存条（左侧「废弃 / 恢复」toggle）。
 * 删除入口只在卡片上（中栏 `ForeshadowView`），右栏不再提供。
 *
 * 状态口径：**不可手动编辑**，「建设中 / 埋设中 / 已回收 / 已废弃」由
 * `deriveForeshadowStatus`（`src/shared/foreshadowStatus.ts`）按锚点与废弃标记派生。
 * 三个移除入口（正文埋点 / 大纲埋点 / 回收位置）均走二次确认后落库，列表刷新后状态自动重算；
 * 已回收（有回收点）时两个埋点的「移除」禁用——须先移除回收位置，服务端同样拒绝。
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
import { deriveForeshadowStatus } from '../../../../../shared/foreshadowStatus'
import { sliceSelectedText } from '../../../../../shared/foreshadowAnchorText'
import { FormField, Input, Button, useToast, useTooltip } from '../../../components/ui'
import SaveBar from '../SaveBar'
import ConfirmDialog from '../ConfirmDialog'
import type { ChapterRow, VolumeRow } from '../chapters/chapterTree'
import type { OutlineItemRow } from '../outline/outlineTree'
import ForeshadowAnchorBlock from './ForeshadowAnchorBlock'
import ForeshadowDescriptionField from './ForeshadowDescriptionField'
import {
  buildForeshadowPatch,
  createForeshadowDraft,
  resolveForeshadowAnchor,
  resolveForeshadowAnchor2,
  resolveForeshadowRecoverAnchor,
  type ForeshadowBundle,
  type ForeshadowClearAnchorOutcome,
  type ForeshadowDraft,
  type ForeshadowRow,
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
      bookId={bundle.bookId}
      chapters={chapters}
      volumes={volumes}
      outlineItems={outlineItems}
      onUpdate={bundle.onUpdate}
      onClearBodyAnchor={bundle.onClearBodyAnchor}
      onClearOutlineAnchor={bundle.onClearOutlineAnchor}
      onClearRecoverAnchor={bundle.onClearRecoverAnchor}
      onSetAbandoned={bundle.onSetAbandoned}
      onDirtyChange={bundle.onDirtyChange}
      saveRef={bundle.saveRef}
    />
  )
}

interface ForeshadowPanelFormProps {
  row: ForeshadowRow
  /** 归属书 id（描述富文本的实体高亮按书匹配）。 */
  bookId: string
  chapters: readonly ChapterRow[]
  volumes: readonly VolumeRow[]
  outlineItems: readonly OutlineItemRow[]
  onUpdate: (id: number, patch: ForeshadowUpdatePatch) => Promise<boolean>
  onClearBodyAnchor: (id: number) => Promise<ForeshadowClearAnchorOutcome>
  onClearOutlineAnchor: (id: number) => Promise<ForeshadowClearAnchorOutcome>
  onClearRecoverAnchor: (id: number) => Promise<boolean>
  onSetAbandoned: (id: number, abandoned: boolean) => Promise<'ok' | 'recovered' | 'failed'>
  onDirtyChange: (dirty: boolean) => void
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
}

/** 可移除的锚点槽位（正文埋点 / 大纲埋点 / 回收位置）。 */
type RemoveTarget = 'body' | 'anchor2' | 'recover'

/** 移除确认框文案（显式映射，避免动态模板键绕过 i18n 类型校验）。 */
const REMOVE_DIALOG_KEYS = {
  body: {
    title: 'dialog.removeBody.title',
    message: 'dialog.removeBody.message',
    confirm: 'dialog.removeBody.confirm'
  },
  anchor2: {
    title: 'dialog.removeAnchor2.title',
    message: 'dialog.removeAnchor2.message',
    confirm: 'dialog.removeAnchor2.confirm'
  },
  recover: {
    title: 'dialog.removeRecover.title',
    message: 'dialog.removeRecover.message',
    confirm: 'dialog.removeRecover.confirm'
  }
} as const

/** 单条编辑表单（按 `row.id + draftResetKey` 重建，内部持草稿；手动保存 + 脏态上报）。 */
function ForeshadowPanelForm({
  row,
  bookId,
  chapters,
  volumes,
  outlineItems,
  onUpdate,
  onClearBodyAnchor,
  onClearOutlineAnchor,
  onClearRecoverAnchor,
  onSetAbandoned,
  onDirtyChange,
  saveRef
}: ForeshadowPanelFormProps) {
  const { t } = useTranslation('foreshadow')
  const fieldId = useId()

  const [draft, setDraft] = useState<ForeshadowDraft>(() => createForeshadowDraft(row))
  // 富文本编辑器的初始正文只在挂载时读取一次（外层按 `row.id + draftResetKey` 重建即回退草稿）。
  const [initialDescriptionJson] = useState<string | null>(() => draft.descriptionJson)
  const [saving, setSaving] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  /** 非 null = 对应锚点槽位的「移除」二次确认打开。 */
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null)
  const [removing, setRemoving] = useState(false)
  const { show: showToast, node: toastNode } = useToast()

  /** 只读派生状态：回收点优先 → 废弃标记 → 埋点 → 建设中（不可手动编辑）。 */
  const displayStatus = useMemo(() => deriveForeshadowStatus(row), [row])
  /** 已回收：两个埋点槽位的「移除」禁用（须先移除回收位置，服务端同样拒绝）。 */
  const removeLocked = row.recoverAnchorKind !== 'none'

  const patch = useMemo(() => buildForeshadowPatch(row, draft), [row, draft])
  const changed = Object.keys(patch).length > 0
  const titleEmpty = draft.title.trim() === ''

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
   * 移除锚点槽位：正文埋点 / 大纲埋点 / 回收位置共用同一流程。
   * 落库成功后由 bundle 广播标记刷新，正文 / 大纲标记随之消失，状态按派生重算；
   * 提示沿用通用的保存成功 / 失败口径。
   */
  const removeAnchor = useCallback(async (): Promise<void> => {
    if (removeTarget === null) return
    setRemoving(true)
    const target = removeTarget
    const result: ForeshadowClearAnchorOutcome =
      target === 'body'
        ? await onClearBodyAnchor(row.id)
        : target === 'anchor2'
          ? await onClearOutlineAnchor(row.id)
          : (await onClearRecoverAnchor(row.id))
            ? 'ok'
            : 'failed'
    setRemoving(false)
    setRemoveTarget(null)
    // 已回收被服务端拒绝（理论上已被禁用挡住）：提示先移除回收位置。
    showToast(
      result === 'ok'
        ? t('toast.updateSuccess')
        : result === 'recovered'
          ? t('detail.removeRecoveredHint')
          : t('toast.clearAnchorFailed')
    )
  }, [
    onClearBodyAnchor,
    onClearOutlineAnchor,
    onClearRecoverAnchor,
    removeTarget,
    row.id,
    showToast,
    t
  ])

  /** 废弃 toggle：可撤销，故**不弹**二次确认（误点再点一次即恢复）。 */
  const toggleAbandoned = useCallback(async (): Promise<void> => {
    const abandoned = displayStatus === 'abandoned'
    setAbandoning(true)
    const result = await onSetAbandoned(row.id, !abandoned)
    setAbandoning(false)
    if (result === 'ok') {
      showToast(abandoned ? t('toast.restoreSuccess') : t('toast.abandonSuccess'))
    } else if (result === 'recovered') {
      showToast(t('detail.abandonRecoveredHint'))
    } else {
      showToast(t('toast.updateFailed'))
    }
  }, [displayStatus, onSetAbandoned, row.id, showToast, t])

  // 回收备注：移除回收位置后不再展示（「未回收」块挂旧备注会误导）。
  const recoverNote =
    recoverResolution.state === 'unanchored'
      ? undefined
      : { label: t('detail.recoverNote'), value: row.recoveryNote }

  // 三个锚点块的引用块只显示**选中文字**（快照整段供失效判定 / 存活匹配，不在此展示）；
  // 区间缺失 / 越界时切片函数回退整段，避免显示空白。
  const bodySelectedText = sliceSelectedText(row.bodyQuote, row.bodyCharStart, row.bodyCharEnd)
  const outlineSelectedText = sliceSelectedText(
    row.outlineQuote,
    row.outlineCharStart,
    row.outlineCharEnd
  )
  const recoverSelectedText = sliceSelectedText(
    row.recoverQuote,
    row.recoverCharStart,
    row.recoverCharEnd
  )

  const dialogKeys = removeTarget === null ? null : REMOVE_DIALOG_KEYS[removeTarget]

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

          {/* 描述字段是块内唯一伸缩项：外层 FormField 撑满可编辑块剩余高度，
              `fill` 让富文本字段拉满控件容器（实际高度由 writer-foreshadow.css 的
              flex 规则决定），内容超高后字段内部滚动。 */}
          <FormField className="foreshadow-fields__desc" label={t('field.description')}>
            <ForeshadowDescriptionField
              bookId={bookId}
              initialJson={initialDescriptionJson}
              placeholder={t('field.descriptionPlaceholder')}
              ariaLabel={t('field.description')}
              fill
              hoverCard
              onChange={(value) => setDraft((prev) => ({ ...prev, descriptionJson: value.json }))}
            />
          </FormField>
        </div>

        {/* 正文埋点：已埋设才提供「移除」（未锚定无可移除内容）。 */}
        <ForeshadowAnchorBlock
          label={t('detail.plant')}
          resolution={plantResolution}
          selectedText={bodySelectedText}
          emptyText={t('detail.plantEmpty')}
          action={
            row.bodyKind === 'none' ? undefined : (
              <RemoveAnchorAction
                label={t('detail.remove')}
                disabled={removeLocked}
                hint={t('detail.removeRecoveredHint')}
                onClick={() => setRemoveTarget('body')}
              />
            )
          }
        />

        {/* 大纲埋点：仅在已使用大纲槽位时渲染（与中栏卡同口径，不占空块）。
            移除属破坏性操作，走通用 ConfirmDialog 二次确认后再清空 `outline_*`。 */}
        {plant2Resolution === null ? null : (
          <ForeshadowAnchorBlock
            label={t('detail.plant2')}
            resolution={plant2Resolution}
            selectedText={outlineSelectedText}
            emptyText={t('detail.plantEmpty')}
            action={
              <RemoveAnchorAction
                label={t('detail.remove')}
                disabled={removeLocked}
                hint={t('detail.removeRecoveredHint')}
                onClick={() => setRemoveTarget('anchor2')}
              />
            }
          />
        )}

        {/* 回收位置：未回收（`recoverAnchorKind === 'none'`）不显示「移除」。 */}
        <ForeshadowAnchorBlock
          label={t('detail.recover')}
          resolution={recoverResolution}
          selectedText={recoverSelectedText}
          emptyText={t('detail.recoverEmpty')}
          note={recoverNote}
          action={
            row.recoverAnchorKind === 'none' ? undefined : (
              <Button variant="ghost" size="sm" onClick={() => setRemoveTarget('recover')}>
                {t('detail.remove')}
              </Button>
            )
          }
        />
      </div>

      <SaveBar
        className="foreshadow-save-bar"
        dirty={changed && !titleEmpty}
        saving={saving}
        onSave={saveNow}
        leading={
          <AbandonAction
            abandoned={displayStatus === 'abandoned'}
            /** 回收优先：已回收的伏笔不可废弃（服务端同样拒绝）。 */
            disabled={displayStatus === 'recovered'}
            busy={abandoning}
            hint={t('detail.abandonRecoveredHint')}
            abandonLabel={t('detail.abandon')}
            restoreLabel={t('detail.restore')}
            onToggle={() => {
              void toggleAbandoned()
            }}
          />
        }
      />

      {dialogKeys === null ? null : (
        <ConfirmDialog
          open
          title={t(dialogKeys.title)}
          message={t(dialogKeys.message)}
          confirmText={t(dialogKeys.confirm)}
          confirming={removing}
          onConfirm={() => {
            void removeAnchor()
          }}
          onClose={() => {
            if (!removing) setRemoveTarget(null)
          }}
        />
      )}

      {toastNode}
    </div>
  )
}

interface AbandonActionProps {
  /** 当前是否已废弃（决定按钮文案：废弃 / 恢复）。 */
  abandoned: boolean
  /** 禁用（已回收 / 请求中）。 */
  disabled: boolean
  busy: boolean
  /** 禁用原因提示（仅禁用时经自绘 tooltip 展示）。 */
  hint: string
  abandonLabel: string
  restoreLabel: string
  onToggle: () => void
}

/**
 * 保存条左侧「废弃 / 恢复」按钮。
 *
 * 禁用态仍要能显示 tooltip：原生 `disabled` 按钮不触发鼠标事件，故把自绘 tooltip
 * 挂在**外层 span**（按钮禁用时鼠标事件落在 span 上），说明「已回收不可废弃」。
 */
function AbandonAction({
  abandoned,
  disabled,
  busy,
  hint,
  abandonLabel,
  restoreLabel,
  onToggle
}: AbandonActionProps) {
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLSpanElement>({
    content: disabled ? hint : '',
    placement: 'top'
  })

  return (
    <>
      {tooltip}
      <span ref={anchorRef} {...anchorProps} className="foreshadow-save-bar__abandon">
        <Button
          variant="secondary"
          className="wf-btn--on-soft"
          disabled={disabled}
          loading={busy}
          onClick={onToggle}
        >
          {abandoned ? restoreLabel : abandonLabel}
        </Button>
      </span>
    </>
  )
}

interface RemoveAnchorActionProps {
  /** 按钮文案（移除）。 */
  label: string
  /** 禁用（已回收：须先移除回收位置）。 */
  disabled: boolean
  /** 禁用原因提示（仅禁用时经自绘 tooltip 展示）。 */
  hint: string
  onClick: () => void
}

/**
 * 埋点块标题行的「移除」按钮。
 *
 * 与 `AbandonAction` 同口径：原生 `disabled` 按钮不触发鼠标事件，故把自绘 tooltip
 * 挂在**外层 span**，说明「已回收的伏笔不可移除埋点」；回收位置块沿用普通按钮。
 */
function RemoveAnchorAction({ label, disabled, hint, onClick }: RemoveAnchorActionProps) {
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLSpanElement>({
    content: disabled ? hint : '',
    placement: 'top'
  })

  return (
    <>
      {tooltip}
      <span ref={anchorRef} {...anchorProps}>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onClick}>
          {label}
        </Button>
      </span>
    </>
  )
}
