import { useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent } from '@tiptap/react'
import { RICH_TEXT_EXTENSIONS, toCssString } from '../../../components/editor/richTextExtensions'
import {
  useRichTextBodyEditor,
  type RichTextBodyValue
} from '../../../components/editor/useRichTextBodyEditor'
import { DocWordLimit } from '../docWordLimit'
import { EntityHighlight } from '../entities/entityHighlight'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'
import { usePlotEditor } from './plotEditorContext'

/**
 * 剧情场景正文扩展**底座**：**通用块级富文本底座**（`RICH_TEXT_EXTENSIONS`，与大纲条目正文共用，§9）
 * + `DocWordLimit`（单篇正文有效字数上限 20 万，与章节 / 大纲同一口径）。
 *
 * ⚠️ 模块级常量引用（`useEditor` 按引用比对选项，见 `RICH_TEXT_EXTENSIONS` 说明）——
 * 不得内联到 `useEditor` 调用处，否则同页标题输入框的中文输入法组合串会被丢弃。
 * 实体高亮（`EntityHighlight`）按书配置 `getBookId`，故在组件内以 `useMemo([bookId])`
 * 追加（见组件内说明），不并入本常量。
 */
const PLOT_BODY_BASE_EXTENSIONS = [...RICH_TEXT_EXTENSIONS, DocWordLimit]

/** 正文归一值：纯文本摘要 + 整条块级 JSON（空正文 → `''` / `null`，与主进程同口径）。 */
export interface PlotBodyValue {
  /** 派生纯文本摘要（与 `editor.state.doc.textContent` 同口径，落库 `description`）。 */
  description: string
  /** 整条块级 Tiptap JSON 串（空正文 → `null`，落库 `description_json`）。 */
  descriptionJson: string | null
}

export interface PlotBodyEditorProps {
  /** 初始正文（场景行 `descriptionJson`；`null` = 空正文）。仅在挂载时读取一次（外层按 `scene.id` 重建）。 */
  initialJson: string | null
  /** 正文变更：产出**已归一**的 `PlotBodyValue`（空文档 → `null` / `''`，与主进程 `richText` 同口径）。 */
  onChange: (value: PlotBodyValue) => void
}

/**
 * 剧情场景正文富文本编辑器（右栏正文字段）：Tiptap 块级正文（heading / 列表 / 引用 / 代码块 /
 * 分隔线 / 表格 / 高亮 / 字色 / 行内图片），排版复用全局 `.doc-body` 口径（便于排版组统一生效）。
 *
 * 编辑器状态与副作用已抽到通用 hook `useRichTextBodyEditor`（§9：剧情 / 设定库两壳共用），
 * 本组件只保留**剧情域**部分：扩展装配（实体高亮 + 字数上限）、编辑器实例注册到
 * `plotEditorContext`、占位文案（`plot` ns）与 `.plot-body-editor` 容器。
 *
 * - **读写**：挂载时用 `initialJson` 建 doc（`null` / 非法 → 空文档）；`update` 事件产出
 *   `editor.getJSON()`（JSON 真源）+ `editor.state.doc.textContent`（纯文本摘要），
 *   二者**与主进程 `derivePlainText` 同口径**（递归拼接文本、无分隔符），保证保存回写后
 *   「草稿 = 场景行」从而正确转净；
 * - **空正文归一**：doc 顶层全为空段落时产出 `null` / `''`（与主进程 `isEmptyRichDoc` 同口径），
 *   避免「空场景一挂载就误报 dirty」与「空文档落库」；
 * - **聚焦态**：在**容器**（非仅 ProseMirror）上按 focus-within 语义上报，容器内焦点转移不算失焦；
 *   卸载兜底上报「非编辑中」（切场景销毁时浏览器可能不派发 blur）；
 * - **实例共享**：`editor` 经 `plotEditorContext` 注册给标题栏工具栏（聚焦编辑时渲染格式 / 撤销重做），
 *   聚焦态同样经该槽位 `reportEditing` 上提（与设定库正文同一机制）；
 * - **实体高亮**：接入 `EntityHighlight`（按书经 `entities:matchMany` 批量匹配），正文中的
 *   实体名 / 别名自动高亮；悬停卡经容器事件委托（`useEntityHover`）显示。匹配口径与章节正文
 *   一致——所有 textblock 参与（标题 / 列表 / 引用等），仅代码块排除；
 * - **不落库**：只改外层草稿（经 `onChange`），由外层「手动保存」按既有 patch 机制提交。
 */
export default function PlotBodyEditor({ initialJson, onChange }: PlotBodyEditorProps) {
  const { t } = useTranslation('plot')
  // 编辑器实例 / 聚焦态 / 归属书 id：统一从 `plot` 槽位读取（与设定库正文同款薄壳）。
  const { bookId = '', registerEditor, reportEditing } = usePlotEditor()

  // ⚠️ EntityHighlight 的 `getBookId` 闭包**必须**捕获当前 `bookId`（不可提到模块级常量）：
  // 防抖到期时运行时调用 `options.getBookId()` 取当前书 id；固化首次渲染的 id 会导致
  // 路由切书后跨书错匹配。`extensions` 经 `useMemo([bookId])` 恒等（仅在切书时重建）。
  const extensions = useMemo(
    () => [
      ...PLOT_BODY_BASE_EXTENSIONS,
      // `matchOnCreate`：正文经 `useEditor` 的 `content` 直接带入（无载入事务），
      // 故需在创建后补一次全段匹配，打开场景即高亮既有正文（见 `EntityHighlightOptions`）。
      EntityHighlight.configure({
        getBookId: () => bookId,
        matchOnCreate: true
      })
    ],
    [bookId]
  )

  // 归一值适配：通用 hook 产出 `{ text, json }`，剧情域对外契约沿用 `PlotBodyValue`
  //（`{ description, descriptionJson }`）——形状与口径均不变。
  const handleChange = useCallback(
    (value: RichTextBodyValue): void => {
      onChange(
        value.json === null
          ? { description: '', descriptionJson: null }
          : { description: value.text, descriptionJson: value.json }
      )
    },
    [onChange]
  )

  const entityHover = useEntityHover()

  const { editor, isEmpty, containerProps } = useRichTextBodyEditor({
    initialJson,
    extensions,
    onChange: handleChange,
    onEditingChange: reportEditing,
    // 实例登记给剧情工具栏槽位（`registerEditor`）。
    onEditorReady: (instance) => {
      registerEditor(instance)
    }
  })

  return (
    <div
      className="plot-body-editor"
      {...containerProps}
      onMouseOver={entityHover.onMouseOver}
      onMouseLeave={entityHover.onMouseLeave}
    >
      <EditorContent
        editor={editor}
        className={`doc-body${isEmpty ? ' is-empty' : ''}`}
        style={
          {
            '--editor-placeholder': toCssString(t('editor.contentPlaceholder'))
          } as CSSProperties
        }
      />
      <HoverCard
        anchor={entityHover.anchor}
        onClose={entityHover.close}
        onPointerEnter={entityHover.cancelHide}
        onPointerLeave={entityHover.onMouseLeave}
      />
    </div>
  )
}
