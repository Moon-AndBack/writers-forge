/**
 * 写作页富文本槽位装配 hook：把交给 `RichTextEditorProvider` 的槽位表
 * （`RichTextEditorSlot` → `RichTextEditorSlotSource`）收在一处，`Writer.tsx` 只留一处装配。
 *
 * 为什么外移：写作页已接近单文件 500 行硬上限，槽位表还要接入灵感 / 伏笔模块；
 * 继续堆在页面层必然越界，故把「聚焦态真源 + 上报入口」集中到此，页面只负责传参。
 *
 * 职责边界：
 * - **编辑器实例不在这里**：各域右栏挂载 / 卸载时经 `useRichTextEditor(slot).registerEditor`
 *   自行登记（Provider 侧另有 `editors` 注册表）；本 hook 只提供 `editing` / `onEditingChange`；
 * - **剧情**聚焦态真源在 `usePlotWorkspace`（与状态栏、切换守卫同源），由参数透传，不另存一份；
 * - **设定档案**聚焦态真源在本 hook（`dossierEditing`），右栏 `DossierBodyEditor` 经注册表上报；
 * - **灵感**聚焦态真源在 `useInspirationBundle`、**伏笔**在 `useForeshadowBundle`
 *   （均与 bundle 生命周期同源），以结构类型透传；活动模块不匹配时 bundle 为 null，
 *   本 hook 按「未编辑」处理；
 * - **章节**槽位由中栏 `ChaptersView` 直连 Provider，不经本表，故此处不出现。
 */
import { useMemo, useState } from 'react'
import type { RichTextEditorSlots } from '../../components/editor/richTextEditorContext'

/**
 * 富文本槽位的聚焦态来源（结构类型）：`useInspirationBundle` / `useForeshadowBundle`
 * 的返回值可直接透传，本 hook 不必反向依赖各域模块。
 */
export interface RichTextEditingSource {
  /** 正文编辑器是否处于聚焦编辑。 */
  editing: boolean
  /** 右栏聚焦 / 失焦上报（写回对应 bundle）。 */
  reportEditing: (editing: boolean) => void
}

/**
 * @param plotEditing 剧情正文编辑器是否处于聚焦编辑（真源：`usePlotWorkspace`）
 * @param reportPlotEditing 剧情聚焦 / 失焦上报（写回 `usePlotWorkspace`）
 * @param inspiration 灵感正文聚焦态来源（活动模块非灵感时为 `undefined`）
 * @param foreshadow 伏笔描述聚焦态来源（活动模块非伏笔时为 `undefined`）
 */
export function useWriterRichTextSlots(
  plotEditing: boolean,
  reportPlotEditing: (editing: boolean) => void,
  inspiration?: RichTextEditingSource,
  foreshadow?: RichTextEditingSource
): RichTextEditorSlots {
  // 设定档案右栏正文编辑器聚焦态（真源在此）：右栏 `DossierBodyEditor` 经通用注册表上报。
  const [dossierEditing, setDossierEditing] = useState(false)

  const inspirationEditing = inspiration?.editing ?? false
  const reportInspirationEditing = inspiration?.reportEditing
  const foreshadowEditing = foreshadow?.editing ?? false
  const reportForeshadowEditing = foreshadow?.reportEditing

  // 槽位表只在聚焦态变化时重建：引用稳定，Provider 下游（标题栏工具栏）不因页面其它重渲染空转。
  return useMemo<RichTextEditorSlots>(
    () => ({
      plot: { editing: plotEditing, onEditingChange: reportPlotEditing },
      dossier: { editing: dossierEditing, onEditingChange: setDossierEditing },
      inspiration: {
        editing: inspirationEditing,
        onEditingChange: reportInspirationEditing
      },
      foreshadow: {
        editing: foreshadowEditing,
        onEditingChange: reportForeshadowEditing
      }
    }),
    [
      plotEditing,
      reportPlotEditing,
      dossierEditing,
      inspirationEditing,
      reportInspirationEditing,
      foreshadowEditing,
      reportForeshadowEditing
    ]
  )
}
