import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui'
import { ImageIcon } from '../icons'
import { FormatButton, FormatPopover } from './FormatPopover'
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  externalImageContent,
  isAllowedImageMime,
  isHttpUrl,
  isImagePlaceholder,
  readImageInsertState,
  uploadedImageContent
} from './imageNode'
import type { ImageBlockReason, ImageInsertState } from './imageNode'

/**
 * 大纲页「插入图片」按钮（双入口：选择本地文件 / 输入外链 URL）。
 *
 * - **入口复用** `FormatPopover`（portal 逃生标题栏 overflow）+ `FormatButton` 范式，
 *   与「插入（链接 / 表格）」组同层；独立触发器（不并入 `EditorInsertGroup`），
 *   因为本入口需按**光标位置**整体置灰并给原因，与链接 / 表格的可用性口径不同。
 * - **位置约束**（见 `readImageInsertState`）：仅普通段落（含引用块内段落）可插图；
 *   表格 / 代码块 / 标题 / 列表一律置灰，tooltip **分别给原因**（经 `disabledReason`）。
 * - **本地文件**：`<input type="file">` → 渲染层预校验（mime 白名单 + ≤ 20 MB）→
 *   `File.arrayBuffer()` → `Uint8Array` → `window.api.images.create(bookId, mime, data)`
 *   → 取 `id` 插入节点（`src` 写稳定占位串 `wf-image://<id>`，**不落 blob**）。
 * - **外链 URL**：校验 http / https → 插入节点（`imageId: null`，不入库二进制）。
 * - `bookId` 为空 / undefined 时整入口禁用（图片按书隔离，缺书无法入库）。
 *
 * ⚠️ 命令链一律在事件回调（`onClick` / 异步回调）内 `editor.chain().focus()` 现建，
 * 与其它格式按钮同口径（渲染期建链会冻结旧选区快照）。
 */
export interface EditorImageButtonProps {
  /** Tiptap 编辑器实例；null 时触发器禁用。 */
  editor: Editor | null
  /** 归属书 id（`OutlineEditor` 的 `bookId` prop）；空 / undefined → 禁用插图入口。 */
  bookId?: string
}

/** 编辑器未就绪 / 非可编辑时的兜底态（整入口禁用）。 */
const DISABLED_STATE: ImageInsertState = { editable: false, reason: 'reasonBlock' }

export function EditorImageButton({ editor, bookId }: EditorImageButtonProps): ReactNode {
  const { t } = useTranslation('common')

  const state =
    useEditorState({
      editor,
      selector: ({ editor: instance }): ImageInsertState | null =>
        instance === null ? null : readImageInsertState(instance)
    }) ?? DISABLED_STATE

  const hasBook = typeof bookId === 'string' && bookId !== ''
  // 位置不允许优先按具体块给原因；位置允许但缺书 → 用缺书原因。
  const reason: ImageBlockReason | null = hasBook ? state.reason : 'reasonNoBook'
  const disabledReason = reason === null ? undefined : t(`format.image.${reason}`)

  return (
    <FormatPopover
      editor={editor}
      icon={<ImageIcon />}
      label={t('format.image.group')}
      panelLabel={t('format.image.group')}
      disabled={reason !== null}
      disabledReason={disabledReason}
      width={264}
    >
      {(close) =>
        hasBook ? (
          <ImagePanelBody editor={editor} bookId={bookId} onDone={close} />
        ) : null
      }
    </FormatPopover>
  )
}

interface ImagePanelBodyProps {
  editor: Editor | null
  /** 已确保非空（父组件以 `hasBook` 守卫）。 */
  bookId: string
  /** 插入成功后收起面板。 */
  onDone: () => void
}

function ImagePanelBody({ editor, bookId, onDone }: ImagePanelBodyProps): ReactNode {
  const { t } = useTranslation('common')
  const { show: notify, node: toastNode } = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  // 外链输入框：若光标落在既有外链图节点上则以其余 `src` 预填（占位串不预填）。
  const [url, setUrl] = useState<string>(() => {
    const current = editor?.getAttributes('image').src
    return typeof current === 'string' && current !== '' && !isImagePlaceholder(current) ? current : ''
  })

  const insertUploaded = useCallback(
    (id: number): void => {
      editor?.chain().focus().insertContent(uploadedImageContent(id)).run()
    },
    [editor]
  )

  const handleFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const file = event.target.files?.[0]
      // 复位 input，允许再次选择同一文件。
      event.target.value = ''
      if (!file || !editor) return
      // 渲染层预校验：不发 IPC，避免主进程静默返回 null。
      if (!isAllowedImageMime(file.type)) {
        notify(t('format.image.invalidType'))
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        notify(t('format.image.tooLarge'))
        return
      }
      setBusy(true)
      void (async () => {
        try {
          const buffer = await file.arrayBuffer()
          const row = await window.api.images.create(bookId, file.type, new Uint8Array(buffer))
          if (!row) {
            notify(t('format.image.uploadFailed'))
            return
          }
          insertUploaded(row.id)
          onDone()
        } catch {
          notify(t('format.image.uploadFailed'))
        } finally {
          setBusy(false)
        }
      })()
    },
    [bookId, editor, insertUploaded, notify, onDone, t]
  )

  const applyUrl = useCallback((): void => {
    if (!editor) return
    const trimmed = url.trim()
    if (!isHttpUrl(trimmed)) {
      notify(t('format.image.invalidUrl'))
      return
    }
    editor.chain().focus().insertContent(externalImageContent(trimmed)).run()
    onDone()
  }, [editor, notify, onDone, t, url])

  return (
    <>
      {toastNode}
      <div className="wf-format-pop__section">
        <div className="wf-format-pop__title">{t('format.image.fileTitle')}</div>
        <input
          ref={fileRef}
          className="wf-format-pop__file"
          type="file"
          accept={IMAGE_MIME_TYPES.join(',')}
          onChange={handleFile}
          disabled={busy}
        />
        <div className="wf-format-pop__actions">
          <FormatButton
            label={t('format.image.filePick')}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          />
        </div>
      </div>

      <div className="wf-format-pop__section">
        <div className="wf-format-pop__title">{t('format.image.urlTitle')}</div>
        <input
          className="wf-format-pop__url"
          type="text"
          value={url}
          placeholder={t('format.image.urlPlaceholder')}
          aria-label={t('format.image.urlAria')}
          disabled={busy}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              applyUrl()
            }
          }}
        />
        <div className="wf-format-pop__actions">
          <FormatButton
            label={t('format.image.urlApply')}
            disabled={busy}
            onClick={applyUrl}
          />
        </div>
      </div>
    </>
  )
}

export default EditorImageButton
