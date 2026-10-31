import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import SaveBar from '../SaveBar'
import PlotBodyEditor, { type PlotBodyValue } from './PlotBodyEditor'
import { type PlotLineRow, type PlotSceneRow, type UpdatePlotScenePatch } from './plotTree'

/** 表单草稿快照（按 `scene` 初始化；仅用于「变更字段」比对与手动保存载荷）。 */
interface SceneDraft {
  /** 派生纯文本摘要（`descriptionJson` 的 text 拼接结果；空正文 = ''）。 */
  description: string
  /** 整条块级 Tiptap JSON 串（`null` = 空正文）；正文变更的**真源**（比对与落库均以它为准）。 */
  descriptionJson: string | null
}

/**
 * 构建**仅变更字段**补丁：右栏只编辑正文，故仅比对 `descriptionJson` + `description`；
 * 未变更不下发（空对象 = 无改动）。
 */
function buildScenePatch(scene: PlotSceneRow, draft: SceneDraft): UpdatePlotScenePatch {
  const patch: UpdatePlotScenePatch = {}
  // 正文：富文本 JSON 为真源（空文档已在编辑侧归一为 `null`，与主进程同口径）；变更时
  // **两列同提交**（语义同批A：数据层据 JSON 派生摘要，两列恒同步）。
  if (draft.descriptionJson !== scene.descriptionJson) {
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
  /** 保存场景补丁（仅覆盖提供的字段；返回写入 promise 供「保存中」态）。 */
  onUpdateScene: (id: number, patch: UpdatePlotScenePatch) => void | Promise<void>
  /** 脏态上报（右栏：保存按钮禁用态 + 切换守卫据此拦截）。 */
  onDirtyChange: (dirty: boolean) => void
  /** 未保存改动（真源为本表单草稿比对，经右栏回传后驱动保存按钮；无改动 = 净态）。 */
  dirty: boolean
  /** 保存入口：表单挂载时写入 `saveNow`（仅变更字段补丁），供切换确认「保存」调用。 */
  saveRef: RefObject<(() => void) | null>
}

/**
 * 剧情节点编辑器（右栏）：**仅编辑选中场景的正文（富文本）**。
 *
 * - 时间 / 标题 / 出场关联三块字段在中栏（`PlotTimeline` 行内弹窗，均即时落库），
 *   右栏只保留正文卡 + 保存条（删除节点在中栏卡片标题旁）；
 * - 表单一经挂载即以 `scene` 初始化（外层用 `key={scene.id}` 保证切换场景时重建，
 *   避免用 effect 同步草稿导致的「输入中被覆盖」问题）；
 * - **手动保存**：正文编辑仅改本地草稿，点保存条「保存」按钮才落库，且只下发变更字段
 *   （`onUpdateScene`）；无改动时按钮禁用；切换节点有改动由 `usePlotWorkspace` 弹两态确认；
 * - 脏态由草稿与 `scene` 比对正文派生，经 `onDirtyChange` 上提；`scene` 行回写后自动转净；
 * - 正文：Tiptap 富文本（见 `PlotBodyEditor`）——初始取 `scene.descriptionJson`（`null` = 空），
 *   编辑产出 `editor.getJSON()` + `doc.textContent` 写入草稿（空文档归一为 `null` / `''`）；
 *   变更时 patch **两列同提交**（`descriptionJson` + `description`）；正文聚焦态由
 *   `PlotBodyEditor` 经通用注册表 `plot` 槽位上提（供标题栏工具栏）。
 */
export default function PlotEditor({
  line,
  scene,
  onUpdateScene,
  onDirtyChange,
  dirty,
  saveRef
}: PlotEditorProps) {
  const { t } = useTranslation('plot')
  // 空态（无选中节点 / 节点被删）= 无草稿：上报净态，避免切走后守卫仍持过期脏标记。
  const empty = scene === null
  useEffect(() => {
    if (empty) onDirtyChange(false)
  }, [empty, onDirtyChange])
  return (
    <>
      {scene === null ? (
        <div className="placeholder-view is-compact" role="note">
          <div className="placeholder-title">{t('editor.emptyEdit')}</div>
          <div className="placeholder-desc">
            {line ? t('editor.clickCard') : t('editor.selectLineFirst')}
          </div>
        </div>
      ) : (
        <PlotEditorForm
          key={scene.id}
          scene={scene}
          dirty={dirty}
          onUpdateScene={onUpdateScene}
          onDirtyChange={onDirtyChange}
          saveRef={saveRef}
        />
      )}
    </>
  )
}

interface PlotEditorFormProps {
  scene: PlotSceneRow
  /** 未保存改动（右栏持有时回传；本表单仅上报比对结果，不自行改写）。 */
  dirty: boolean
  onUpdateScene: (id: number, patch: UpdatePlotScenePatch) => void | Promise<void>
  onDirtyChange: (dirty: boolean) => void
  saveRef: RefObject<(() => void) | null>
}

/** 单节点编辑表单（按 `scene.id` 重建，内部持草稿；手动保存 + 脏态上报）。 */
function PlotEditorForm({
  scene,
  dirty,
  onUpdateScene,
  onDirtyChange,
  saveRef
}: PlotEditorFormProps) {
  // 正文两列（摘要 + 整条 JSON）同持于草稿：编辑侧按「空文档归一为空」产出，保存时同提交。
  const [description, setDescription] = useState(scene.description)
  const [descriptionJson, setDescriptionJson] = useState(scene.descriptionJson)
  // 保存中（写入 promise 未结算）：按钮呈 loading，避免连点重复下发。
  const [saving, setSaving] = useState(false)

  // 草稿 → 「仅变更字段」补丁：既作脏检测（空 = 无改动），也作手动保存载荷。
  const draft = useMemo<SceneDraft>(
    () => ({ description, descriptionJson }),
    [description, descriptionJson]
  )
  const patch = useMemo(() => buildScenePatch(scene, draft), [scene, draft])
  // 本地比对结果（上报真源）；`dirty` 为右栏回传值，供按钮禁用态共用。
  const changed = Object.keys(patch).length > 0

  // 正文变更（编辑器产出已归一的摘要 + JSON）：只写本地草稿，落库仍走手动保存。
  const handleBodyChange = useCallback((value: PlotBodyValue): void => {
    setDescription(value.description)
    setDescriptionJson(value.descriptionJson)
  }, [])

  // 手动保存：仅落变更字段；无改动为空操作（与按钮禁用态同口径）。
  const saveNow = useCallback((): void => {
    if (!changed) return
    setSaving(true)
    // 写完（含失败）即复位：失败下 dirty 仍为 true，按钮可再次点击重试。
    void Promise.resolve(onUpdateScene(scene.id, patch)).finally(() => setSaving(false))
  }, [changed, onUpdateScene, patch, scene.id])

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
          {/* 富文本正文（Tiptap）：初始正文取场景行 `descriptionJson`；变更经 `onChange` 写入草稿，
              聚焦 / 失焦由 `PlotBodyEditor` 经 plot 槽位上提（供标题栏工具栏）。外层按 `scene.id`
              重建，故初始正文只在挂载时读取一次。 */}
          <PlotBodyEditor initialJson={scene.descriptionJson} onChange={handleBodyChange} />
        </div>
      </div>

      {/* 手动保存：无改动禁用；保存中 loading（通用保存条，§9 与设定库右栏同源）；
          保存条为独立底色卡片（`plot-save-bar`），与上方正文卡间距同设定库右栏。 */}
      <SaveBar className="plot-save-bar" dirty={dirty} saving={saving} onSave={saveNow} />
    </div>
  )
}
