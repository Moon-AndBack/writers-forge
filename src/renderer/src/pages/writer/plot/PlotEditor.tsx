import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/EmptyState'
import { LoadErrorState } from '../../../components/LoadErrorState'
import { useToast } from '../../../components/ui'
import SaveBar from '../SaveBar'
import PlotBodyEditor, { type PlotBodyValue } from './PlotBodyEditor'
import { type PlotLineRow, type PlotSceneRow, type UpdatePlotScenePatch } from './plotTree'
import {
  invalidatePlotSceneContent,
  usePlotSceneContent,
  type PlotSceneContent
} from './usePlotSceneContent'

/** 正文快照（draft / 脏检测基线同构；仅用于「变更字段」比对与手动保存载荷）。 */
interface SceneDraft {
  /** 派生纯文本摘要（`descriptionJson` 的 text 拼接结果；空正文 = ''）。 */
  description: string
  /** 整条块级 Tiptap JSON 串（`null` = 空正文）；正文变更的**真源**（比对与落库均以它为准）。 */
  descriptionJson: string | null
}

/**
 * 构建**仅变更字段**补丁：右栏只编辑正文，故仅比对 `descriptionJson` + `description`；
 * 未变更不下发（空对象 = 无改动）。
 *
 * `baseline` 必须是**实际加载到的正文**（`usePlotSceneContent` 的结果，保存成功后推进），
 * 不能用列表行 `scene.descriptionJson`——列表已投影掉该字段，误用会把正文判成「全部清空」。
 */
function buildScenePatch(baseline: SceneDraft, draft: SceneDraft): UpdatePlotScenePatch {
  const patch: UpdatePlotScenePatch = {}
  // 正文：富文本 JSON 为真源（空文档已在编辑侧归一为 `null`，与主进程同口径）；变更时
  // **两列同提交**（语义同批A：数据层据 JSON 派生摘要，两列恒同步）。
  if (draft.descriptionJson !== baseline.descriptionJson) {
    patch.descriptionJson = draft.descriptionJson
    patch.description = draft.description
  }
  return patch
}

export interface PlotEditorProps {
  /** 当前选中剧情线；null = 未选中（仅用于右栏上下文提示）。 */
  line: PlotLineRow | null
  /** 当前选中场景节点；null = 未选中（渲染空态）。 */
  scene: PlotSceneRow | null
  /** 是否为前台模块（`module === 'plot'`）：为假时不读取正文，避免常驻右栏空拉。 */
  active: boolean
  /** 保存场景补丁（仅覆盖提供的字段；返回写入 promise 供「保存中」态 / 关闭前 flush 判定成败）。 */
  onUpdateScene: (id: number, patch: UpdatePlotScenePatch) => void | Promise<boolean>
  /** 脏态上报（右栏：保存按钮禁用态 + 切换守卫据此拦截）。 */
  onDirtyChange: (dirty: boolean) => void
  /** 未保存改动（真源为本表单草稿比对，经右栏回传后驱动保存按钮；无改动 = 净态）。 */
  dirty: boolean
  /** 保存入口：表单挂载时写入 `saveNow`（仅变更字段补丁），供切换确认「保存」/ 关闭前 flush 调用。 */
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
}

/**
 * 剧情节点编辑器（右栏）：**仅编辑选中场景的正文（富文本）**。
 *
 * - 时间 / 标题 / 出场关联三块字段在中栏（`PlotTimeline` 行内弹窗，均即时落库），
 *   右栏只保留正文卡 + 保存条（删除节点在中栏卡片标题旁）；
 * - 表单在正文就绪后才挂载，并以**加载到的正文**初始化（外层用 `key={scene.id}` 保证切换
 *   场景时重建，避免用 effect 同步草稿导致的「输入中被覆盖」问题）；
 * - **手动保存**：正文编辑仅改本地草稿，点保存条「保存」按钮才落库，且只下发变更字段
 *   （`onUpdateScene`）；无改动时按钮禁用；切换节点有改动由 `usePlotWorkspace` 弹两态确认；
 * - 正文**按需读取**：列表行已投影掉 `descriptionJson`（见主进程 `PLOT_SCENE_LIST_COLUMNS`），
 *   本组件经 `usePlotSceneContent` 按 `scene.id` 懒取正文；未就绪（loading / 失败）时
 *   **不挂载编辑器**——`PlotBodyEditor` 只在挂载时读一次 `initialJson`，提前挂空编辑器会
 *   让「先输一个字再保存」把真实正文覆盖为空；
 * - 脏态由草稿与**实际加载到的正文基线**比对派生（保存成功后基线推进为刚落库值），经
 *   `onDirtyChange` 上提；
 * - 正文：Tiptap 富文本（见 `PlotBodyEditor`）——初始取加载到的 `descriptionJson`
 *   （`null` = 空），编辑产出 `editor.getJSON()` + `doc.textContent` 写入草稿（空文档归一为
 *   `null` / `''`）；变更时 patch **两列同提交**（`descriptionJson` + `description`）；
 *   正文聚焦态由 `PlotBodyEditor` 经通用注册表 `plot` 槽位上提（供标题栏工具栏）。
 */
export default function PlotEditor({
  line,
  scene,
  active,
  onUpdateScene,
  onDirtyChange,
  dirty,
  saveRef
}: PlotEditorProps) {
  const { t } = useTranslation('plot')
  const { t: tCommon } = useTranslation('common')
  // 场景正文懒取（缓存 + 请求序号守卫；`active` 为假不发请求）。
  const { content, error, reload } = usePlotSceneContent(scene?.id ?? null, active)
  // 手动保存失败提示（成功由保存条转净态体现，不重复弹 toast）。
  const { show: showSaveFailed, node: saveFailedToast } = useToast()
  const handleSaveFailed = useCallback((): void => {
    showSaveFailed(tCommon('saveFailed'))
  }, [showSaveFailed, tCommon])
  // 无草稿态（未选中节点 / 正文未就绪 / 读取失败）= 无草稿：上报净态，避免切走后守卫仍持过期脏标记。
  const hasDraft = scene !== null && !error && content !== null
  useEffect(() => {
    if (!hasDraft) onDirtyChange(false)
  }, [hasDraft, onDirtyChange])
  return (
    <>
      {scene === null ? (
        <EmptyState
          compact
          title={t('editor.emptyEdit')}
          description={line ? t('editor.clickCard') : t('editor.selectLineFirst')}
        />
      ) : error ? (
        // 读取失败：绝不挂空编辑器（否则用户输入会覆盖真实正文），只给错误态 + 重试。
        <LoadErrorState compact onRetry={reload} />
      ) : content === null ? (
        // 正文未就绪：占位等待，编辑器仍不挂载（`PlotBodyEditor` 只在挂载时读 initialJson）。
        <EmptyState compact title={tCommon('loading')} />
      ) : (
        <PlotEditorForm
          key={scene.id}
          scene={scene}
          initialContent={content}
          dirty={dirty}
          onUpdateScene={onUpdateScene}
          onDirtyChange={onDirtyChange}
          saveRef={saveRef}
          onSaveFailed={handleSaveFailed}
        />
      )}
      {saveFailedToast}
    </>
  )
}

interface PlotEditorFormProps {
  scene: PlotSceneRow
  /** 已加载到的正文（表单挂载时的脏检测基线；仅在此值就绪后挂载表单）。 */
  initialContent: PlotSceneContent
  /** 未保存改动（右栏持有时回传；本表单仅上报比对结果，不自行改写）。 */
  dirty: boolean
  onUpdateScene: (id: number, patch: UpdatePlotScenePatch) => void | Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
  saveRef: RefObject<(() => void | Promise<boolean>) | null>
  /** 手动保存失败提示（守卫触发的保存失败已由右栏统一提示，此处只覆盖保存条按钮）。 */
  onSaveFailed: () => void
}

/** 单节点编辑表单（按 `scene.id` 重建，内部持草稿；手动保存 + 脏态上报）。 */
function PlotEditorForm({
  scene,
  initialContent,
  dirty,
  onUpdateScene,
  onDirtyChange,
  saveRef,
  onSaveFailed
}: PlotEditorFormProps) {
  // 正文两列（摘要 + 整条 JSON）同持于草稿：编辑侧按「空文档归一为空」产出，保存时同提交。
  const [description, setDescription] = useState(initialContent.description)
  const [descriptionJson, setDescriptionJson] = useState(initialContent.descriptionJson)
  // 脏检测基线：**实际加载到的正文**（不是列表行），保存成功后推进为刚落库的内容。
  const [baseline, setBaseline] = useState<SceneDraft>({
    description: initialContent.description,
    descriptionJson: initialContent.descriptionJson
  })
  // 保存中（写入 promise 未结算）：按钮呈 loading，避免连点重复下发。
  const [saving, setSaving] = useState(false)

  // 草稿 → 「仅变更字段」补丁：既作脏检测（空 = 无改动），也作手动保存载荷。
  const draft = useMemo<SceneDraft>(
    () => ({ description, descriptionJson }),
    [description, descriptionJson]
  )
  const patch = useMemo(() => buildScenePatch(baseline, draft), [baseline, draft])
  // 本地比对结果（上报真源）；`dirty` 为右栏回传值，供按钮禁用态共用。
  const changed = Object.keys(patch).length > 0

  // 正文变更（编辑器产出已归一的摘要 + JSON）：只写本地草稿，落库仍走手动保存。
  const handleBodyChange = useCallback((value: PlotBodyValue): void => {
    setDescription(value.description)
    setDescriptionJson(value.descriptionJson)
  }, [])

  // 手动保存：仅落变更字段；无改动为空操作（与按钮禁用态同口径）。
  // 返回值 = 是否落库成功（无改动视为成功），供父层「关闭前统一 flush」await。
  const saveNow = useCallback((): void | Promise<boolean> => {
    if (!changed) return Promise.resolve(true)
    // 落库快照在提交瞬间捕获：保存期间的新输入不进入本次载荷。
    const snapshot = draft
    setSaving(true)
    // 写完（含失败）即复位：失败下 dirty 仍为 true，按钮可再次点击重试。
    return Promise.resolve(onUpdateScene(scene.id, patch))
      .then((ok) => {
        if (ok === false) return false
        // 成功后基线推进为刚落库内容：无后续输入即转净态；同时把正文缓存更新为刚落库值，
        // 让下一次挂载（放弃草稿 / 切走再回来）与只读详情读到最新正文，而不是旧正文。
        setBaseline(snapshot)
        invalidatePlotSceneContent(scene.id, snapshot)
        return true
      })
      .catch(() => false)
      .finally(() => setSaving(false))
  }, [changed, draft, onUpdateScene, patch, scene.id])

  // 保存条按钮：落库失败弹提示（`saveNow` 失败恒 resolve false）；成功由保存条转净态体现。
  const handleManualSave = useCallback((): void => {
    void Promise.resolve(saveNow()).then((ok) => {
      if (ok === false) onSaveFailed()
    })
  }, [saveNow, onSaveFailed])

  // 上报脏态（右栏保存按钮 + 切换守卫），并把保存入口交给父层（切换确认「保存」调用）；
  // 卸载时注销入口，避免父层拿到已卸载表单的 `saveNow`。
  useEffect(() => {
    onDirtyChange(changed)
    saveRef.current = saveNow
    return () => {
      saveRef.current = null
    }
  }, [changed, onDirtyChange, saveNow, saveRef])

  return (
    <div className="plot-editor">
      <div className="plot-editor-fields">
        <div className="plot-field plot-field--grow">
          {/* 富文本正文（Tiptap）：初始正文为**已加载到的场景正文**（列表行不含正文）；
              变更经 `onChange` 写入草稿，聚焦 / 失焦由 `PlotBodyEditor` 经 plot 槽位上提
              （供标题栏工具栏）。外层按 `scene.id` 重建，故初始正文只在挂载时读取一次。 */}
          <PlotBodyEditor
            initialJson={initialContent.descriptionJson}
            onChange={handleBodyChange}
          />
        </div>
      </div>

      {/* 手动保存：无改动禁用；保存中 loading（通用保存条，§9 与设定库右栏同源）；
          保存条为独立底色卡片（`plot-save-bar`），与上方正文卡间距同设定库右栏。 */}
      <SaveBar className="plot-save-bar" dirty={dirty} saving={saving} onSave={handleManualSave} />
    </div>
  )
}
