import {
  useRichTextEditor,
  type RichTextEditorSlotValue
} from '../../../components/editor/richTextEditorContext'

/**
 * 剧情正文编辑器共享态的**域内别名**（槽位 `'plot'`）。
 *
 * 机制本体为通用注册表 `components/editor/richTextEditorContext`（剧情 / 设定库
 * 两个槽位共用一套实现，§9 禁止平行实现）；本文件只保留剧情域的名字，避免剧情侧的
 * `PlotBodyEditor` / `PlotActivityActions` / `PlotTimeline` 各自写死槽位字符串。
 *
 * `editing`（聚焦态）真源仍是 `usePlotWorkspace`（经 `reportEditing` 上提），
 * `bookId` 供图片插入按书隔离入库；Provider 挂在 `Writer.tsx`（见通用模块说明）。
 */
export function usePlotEditor(): RichTextEditorSlotValue {
  return useRichTextEditor('plot')
}
