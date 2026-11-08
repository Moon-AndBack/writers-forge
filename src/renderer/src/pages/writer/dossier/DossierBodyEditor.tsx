import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent } from '@tiptap/react'
import { RICH_TEXT_EXTENSIONS, toCssString } from '../../../components/editor/richTextExtensions'
import {
  useRichTextBodyEditor,
  type RichTextBodyValue
} from '../../../components/editor/useRichTextBodyEditor'
import { useRichTextEditor } from '../../../components/editor/richTextEditorContext'
import { plainTextToDocJson } from '../../../../../shared/richTextDoc'
import { DocWordLimit } from '../docWordLimit'
import { EntityHighlight } from '../entities/entityHighlight'
import { HoverCard } from '../entities/HoverCard'
import { useEntityHover } from '../entities/useEntityHover'

/**
 * 正文扩展**底座**：通用块级富文本（`RICH_TEXT_EXTENSIONS`）+ 单篇字数上限
 * （`DocWordLimit`，与章节 / 大纲 / 剧情同一口径 20 万）。
 *
 * ⚠️ 模块级常量引用（`useEditor` 按引用比对选项，见 `RICH_TEXT_EXTENSIONS` 说明）——
 * 不得内联到 `useEditor` 调用处，否则同页其它输入框的中文输入法组合串会被丢弃。
 * 实体高亮（`EntityHighlight`）按书配置 `getBookId`，故在组件内以 `useMemo([bookId])`
 * 追加，不并入本常量。
 */
const DOSSIER_BODY_BASE_EXTENSIONS = [...RICH_TEXT_EXTENSIONS, DocWordLimit]

export interface DossierBodyEditorProps {
  /** 归属书 id（实体高亮按书匹配；工具栏插图按书隔离入库）。 */
  bookId: string
  /**
   * 库内富文本 JSON（`world_texts.body_json` 原串；`''` = 尚未富文本化）。
   * **仅在挂载时读取一次**——切条目由调用方按 `key` 重建组件。
   */
  bodyJson: string
  /** 纯文本正文（`world_texts.body`）：`bodyJson` 为空时按行包成文档兜底。 */
  body: string
  /** 正文变更（已归一：空文档 → `text: ''` / `json: null`）；只写上层草稿，不落库。 */
  onChange: (value: RichTextBodyValue) => void
}

/**
 * 设定档案右栏 · 正文富文本编辑器（五域共用，§9）。
 *
 * - **读写**：挂载时以 `bodyJson` 建 doc；老数据（`body_json = ''`）用共享层
 *   `plainTextToDocJson(body)` 兜底，保证「纯文本时代的正文」打开即有内容
 *   （历史上已由 `worldTextsBodyJsonBackfill` 回填，此处只兜底未回填 / 新增行）；
 * - **保存（批 B 手动）**：本组件**不再防抖自动保存**，也不在卸载时落库——每次
 *   `update` 只把归一值回传上层草稿；落库由 `DossierDetail` 的保存按钮统一提交
 *   （`body` 摘要 + `bodyJson` 真源成对写入，避免两列失步）；
 * - **布局**：容器 `.dossier-body-editor` 内部独立滚动，正文版心沿用全局 `.doc-body` 口径
 *   （见 `writer-dossier-split.css`）；**正文区不再自带工具栏**——`editor` 实例与聚焦态
 *   经通用注册表 `useRichTextEditor('dossier')` 注册 / 上报，工具栏由标题栏动作
 *   （`DossierActivityActions`）在聚焦编辑时渲染，与剧情线同一机制；
 * - **实体高亮**：`EntityHighlight` 按书匹配（`matchOnCreate`），口径与章节 / 剧情正文一致；
 *   悬停卡经容器事件委托（`useEntityHover`）显示。
 */
export default function DossierBodyEditor({
  bookId,
  bodyJson,
  body,
  onChange
}: DossierBodyEditorProps) {
  const { t } = useTranslation('dossier')
  // 编辑器共享：实例注册进通用注册表（供标题栏工具栏读取），聚焦态上报回页面层
  // （`Writer.tsx` 的 `dossierEditing`），两态切换见 `DossierActivityActions`。
  const { registerEditor, reportEditing } = useRichTextEditor('dossier')

  // 初始文档：库内 JSON 优先；空串（老数据）→ 纯文本按行包成段落；纯空白 → 空文档。
  const [initialJson] = useState<string | null>(() =>
    bodyJson.trim() !== '' ? bodyJson : plainTextToDocJson(body) || null
  )

  // ⚠️ EntityHighlight 的 `getBookId` 闭包**必须**捕获当前 `bookId`；`extensions` 经
  // `useMemo([bookId])` 恒等（仅切书重建）。
  const extensions = useMemo(
    () => [
      ...DOSSIER_BODY_BASE_EXTENSIONS,
      // `matchOnCreate`：正文经 `useEditor` 的 `content` 直接带入（无载入事务），
      // 故需在创建后补一次全段匹配，打开条目即高亮既有正文。
      EntityHighlight.configure({
        getBookId: () => bookId,
        matchOnCreate: true
      })
    ],
    [bookId]
  )

  const entityHover = useEntityHover()

  const { editor, isEmpty, containerProps } = useRichTextBodyEditor({
    initialJson,
    extensions,
    onChange,
    onEditingChange: reportEditing,
    // 实例登记给通用工具栏注册表（`registerEditor`）。
    onEditorReady: (instance) => {
      registerEditor(instance)
    }
  })

  return (
    <div
      className="dossier-body-editor"
      {...containerProps}
      onMouseOver={entityHover.onMouseOver}
      onMouseLeave={entityHover.onMouseLeave}
    >
      <EditorContent
        editor={editor}
        className={`doc-body${isEmpty ? ' is-empty' : ''}`}
        style={
          {
            '--editor-placeholder': toCssString(t('detail.bodyPlaceholder'))
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
