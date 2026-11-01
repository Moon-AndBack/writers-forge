import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { useModuleLabel } from '../../../shell/activityBarModules'
import SaveBar from '../SaveBar'
import {
  buildDossierPatch,
  createDossierDraft,
  createSubtypeValues,
  parseRank,
  type DossierDraft,
  type DossierSubtypeValues
} from './dossierDraft'
import type {
  DossierDetail as DossierDetailData,
  DossierModule,
  DossierUpdatePatch
} from './dossierTree'
import DossierBodyEditor from './DossierBodyEditor'
import SubtypeFieldsPanel from './SubtypeFieldsPanel'

export interface DossierDetailProps {
  /** 所属域（空态文案取模块名）。 */
  module: DossierModule
  /** 当前选中行详情（null = 未选中，渲染空态）。 */
  detail: DossierDetailData | null
  /** 选中行已定但详情尚未回填（true 时渲染空白，不渲染空态——避免切换条目闪帧）。 */
  detailPending: boolean
  /** 右栏上报的未保存改动（保存按钮禁用态；真源为本面板草稿比对）。 */
  dirty: boolean
  /** 更新（正文 / 子类字段 / 品阶档位 / 自定义键值补丁；返回写入 promise 供「保存中」态）。 */
  onUpdate: (id: number, patch: DossierUpdatePatch) => void | Promise<void>
  /** 脏态上报（切换守卫 + 保存按钮共用）。 */
  onDirtyChange: (dirty: boolean) => void
  /** 保存入口：表单挂载时写入 `saveNow`（切换确认「保存」/ 切模块兜底调用）。 */
  saveRef: RefObject<(() => void | Promise<void>) | null>
}

/**
 * 设定档案右栏详情面板（五域共用，按 module 参数化）
 * **上下两张卡片 + 底部保存条**：
 *
 * - **上段** `.dossier-fields-panel`：只放**子类表内字段**——世界观 / 物品功法 / 势力
 *   各自的专属字段组、物品预设子类的品阶 / 档位、自定义子类的键值字段，以及境界体系的
 *   「体系类型」（`world_power_system.kind`）（`SubtypeFieldsPanel`）。名称 / 类别 / 别名
 *   不在右栏展示（编辑入口在中栏卡片铅笔弹窗 `DossierEditDialog`）；标签与关系同样不在
 *   右栏展示；删除只在中栏卡片垃圾桶。
 * - **下段** `.dossier-body-panel`：富文本正文 `DossierBodyEditor`，
 *   撑满剩余高度、内部独立滚动。
 * - **底部** `.dossier-save-bar`：独立底色卡片，内含手动保存按钮（无脏禁用 / 保存中 loading）。
 *
 * **保存口径（批 B 手动）**：本面板集中持有草稿（正文 + 子类字段 + 品阶档位 + 体系类型 +
 * 自定义键值），子组件全部受控；草稿与 `detail` 原值比对得出脏态并上报，点保存才组装
 * 「仅变更字段」补丁一次提交（正文两列成对）。未保存时切换条目由 `useDossierWorkspace`
 * 弹两态确认；切模块则由 workspace 在右栏卸载前自动保存兜底。
 */
export default function DossierDetail({
  module,
  detail,
  detailPending,
  dirty,
  onUpdate,
  onDirtyChange,
  saveRef
}: DossierDetailProps) {
  const { t } = useTranslation('dossier')
  const moduleLabel = useModuleLabel(module)

  // 空态（无选中条目 / 条目被删）= 无草稿：上报净态，避免切走后守卫仍持过期脏标记。
  const empty = detail === null
  useEffect(() => {
    if (empty) onDirtyChange(false)
  }, [empty, onDirtyChange])

  // 选中项已切换、详情仍在加载：渲染空白（不渲染空态）。否则每点一张卡都会先闪一帧
  // 「选择一个条目」并让布局跳一下（`.rp-body` 已 overflow: hidden，空白帧不产生滚动条）。
  // 不使用「加载期保留上一份详情」：旧表单在过渡帧仍挂载会上报脏态，与切换守卫冲突。
  if (detailPending) return null

  if (detail === null) {
    return (
      <div className="placeholder-view is-compact" role="note">
        <div className="placeholder-title">{t('detail.emptyTitle', { module: moduleLabel })}</div>
        <div className="placeholder-desc">{t('detail.emptyDesc')}</div>
      </div>
    )
  }

  // 按 `detail.id` 重建表单：切条目草稿随之复位（切换前已由守卫保存 / 丢弃）。
  return (
    <DossierDetailForm
      key={detail.id}
      detail={detail}
      dirty={dirty}
      onUpdate={onUpdate}
      onDirtyChange={onDirtyChange}
      saveRef={saveRef}
    />
  )
}

interface DossierDetailFormProps {
  detail: DossierDetailData
  dirty: boolean
  onUpdate: (id: number, patch: DossierUpdatePatch) => void | Promise<void>
  onDirtyChange: (dirty: boolean) => void
  saveRef: RefObject<(() => void | Promise<void>) | null>
}

/** 单条目编辑表单（按 `detail.id` 重建，内部持草稿；手动保存 + 脏态上报）。 */
function DossierDetailForm({
  detail,
  dirty,
  onUpdate,
  onDirtyChange,
  saveRef
}: DossierDetailFormProps) {
  const [draft, setDraft] = useState<DossierDraft>(() => createDossierDraft(detail))
  // 保存中（写入 promise 未结算）：按钮呈 loading，避免连点重复下发。
  const [saving, setSaving] = useState(false)

  // 子类变更（编辑弹窗改类别）会换一套字段结构：草稿的子类字段随之从新详情重置，
  // 否则旧子类的键会被判成「改动」。正文草稿保留（类别变更不影响正文）。
  const subtypeKey = `${detail.subtypeId ?? 'none'}:${detail.presetKey}`
  const subtypeKeyRef = useRef(subtypeKey)
  useEffect(() => {
    if (subtypeKeyRef.current === subtypeKey) return
    subtypeKeyRef.current = subtypeKey
    setDraft((prev) => ({ ...prev, ...createSubtypeValues(detail) }))
  }, [subtypeKey, detail])

  // 草稿 → 「仅变更字段」补丁：既作脏检测（空 = 无改动），也作手动保存载荷。
  const patch = useMemo(() => buildDossierPatch(detail, draft), [detail, draft])
  const changed = Object.keys(patch).length > 0

  // 子类字段变更（受控回传，只写草稿）。
  const handleFieldsChange = useCallback((next: Partial<DossierSubtypeValues>): void => {
    setDraft((prev) => ({ ...prev, ...next }))
  }, [])

  // 正文变更（编辑器已归一：空文档 → `''` / `null`）：只写草稿，落库走保存按钮。
  const handleBodyChange = useCallback((value: { text: string; json: string | null }): void => {
    setDraft((prev) => ({ ...prev, body: value.text, bodyJson: value.json ?? '' }))
  }, [])

  // 手动保存：仅落变更字段；无改动为空操作。档位原文先归一为整数文本，
  // 避免「007」之类中间输入留存（非法 / 空白归 0，与旧失焦提交同口径）。
  const saveNow = useCallback((): void | Promise<void> => {
    if (!changed) return
    setDraft((prev) => ({ ...prev, rankText: String(parseRank(prev.rankText)) }))
    setSaving(true)
    // 写完（含失败）即复位：失败下详情未回写、脏态仍为 true，按钮可再次点击重试。
    return Promise.resolve(onUpdate(detail.id, patch)).finally(() => setSaving(false))
  }, [changed, onUpdate, detail.id, patch])

  // 上报脏态 + 注册保存入口。⚠️ 卸载时**不注销** `saveRef`：切模块会先卸载右栏，
  // workspace 的清理阶段仍需取到最后一笔草稿做自动保存兜底（见 `useDossierWorkspace`）。
  useEffect(() => {
    onDirtyChange(changed)
    saveRef.current = saveNow
  }, [changed, onDirtyChange, saveNow, saveRef])

  return (
    <>
      <div className="dossier-detail dossier-detail--split">
        {/* `on-soft`：本卡片为 --soft-solid 底色，内部子类字段控件需换用
            --control-on-soft 令牌，否则输入框与卡片同色、边界不可辨（见 form.css）。 */}
        <div className="dossier-fields-panel on-soft">
          <SubtypeFieldsPanel
            detail={detail}
            values={draft}
            onChange={handleFieldsChange}
            showEmptyHint
          />
        </div>
        <div className="dossier-body-panel">
          <DossierBodyEditor
            bookId={detail.bookId}
            bodyJson={detail.bodyJson}
            body={detail.body}
            onChange={handleBodyChange}
          />
        </div>
      </div>
      {/* 底部保存条：独立底色卡片（与上方两卡区分）；无脏禁用、保存中 loading。 */}
      <SaveBar
        className="dossier-save-bar on-soft"
        dirty={dirty}
        saving={saving}
        onSave={saveNow}
      />
    </>
  )
}
