import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { getCachedImage, setCachedImage } from '@renderer/lib/imageBlobCache'
import { isImagePlaceholder } from './imageNode'

/**
 * `Uint8Array` → 新建 `Uint8Array<ArrayBuffer>` 副本。
 *
 * 跨 IPC 传来的 `data` 类型为 `Uint8Array<ArrayBufferLike>`，其 `buffer` 可能是
 * `SharedArrayBuffer`，不能直接作 `BlobPart`；复制到普通 `ArrayBuffer` 后备后即可安全构造 `Blob`。
 */
function bytesOf(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy
}

/**
 * 大纲正文「图片」节点视图（Tiptap 3 `ReactNodeViewRenderer`）。
 *
 * 职责：把节点 `attrs` 渲染为 `<img>`，并在**上传图**（`imageId` 非空）场景按 id
 * 经 `images:get` 拉取二进制 → `Blob` → `URL.createObjectURL` 补水 `src`。
 *
 * 加载策略（打开章节不再一次请求全部图片）：
 * - **视口门控**：Tiptap 为文档中所有图片建 NodeView，挂载即拉取会让整个章节的图片全部走
 *   IPC；这里用 `IntersectionObserver`（`rootMargin: 400px`）只在接近视口时才拉取。
 *   `loading="lazy"` 只延迟解码、不延迟 IPC，故仅作第二道保险。
 * - **Blob 缓存**：按 `image:<id>` 命中 `imageBlobCache` 时直接复用，切章 / 重挂载不重复拉取。
 *
 * 生命周期（本批最易漏点）：
 * - object URL 在 **effect 内创建**，其返回的清理函数在**卸载 / `imageId` 变化**时
 *   `revokeObjectURL` —— 卸载即释放，切换图片即释放旧 URL，无内存泄漏；缓存共享的是 Blob，
 *   每个 NodeView 各建各的 URL，互不吊销；
 * - `null`（悬空 id / 图已删 / 拉取失败）→ 渲染**缺图占位**（虚线框 + 提示），不抛错；
 * - 补水结果按 `forId` 记录、失败按 `src` 记录：旧节点结果不会串到新节点（切章 / 撤销
 *   导致 attrs 变化时自然失效），且 effect 内**无异步回调之外的 setState**。
 *
 * 外链图（`imageId` 为 null、`src` 为 http(s)）直接用原 `src`，不产生 object URL。
 * 节点为**行内**（`EditorImage` 的 `inline: true`），故用 `<span>` 承载（见
 * `ReactNodeViewRenderer` 对 inline 节点的默认容器），避免在段内产生块级断行。
 */
export function ImageNodeView({ node, selected }: ReactNodeViewProps): ReactElement {
  const { t } = useTranslation('common')
  const imageId = typeof node.attrs.imageId === 'number' ? node.attrs.imageId : null
  const rawSrc = typeof node.attrs.src === 'string' ? node.attrs.src : ''
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
  // 外链图：无 imageId 且 src 非占位串（含 http(s) 与历史遗留值）。
  const isExternal = imageId === null && rawSrc !== '' && !isImagePlaceholder(rawSrc)

  // 是否已接近视口（决定要不要发起 IPC）；环境无 IO 时直接放行。
  const [nearViewport, setNearViewport] = useState(
    () => typeof IntersectionObserver === 'undefined'
  )
  // 上传图补水结果（按 id 记录）。
  const [upload, setUpload] = useState<{
    forId: number
    url: string | null
    failed: boolean
  } | null>(null)
  // 加载失败的真实 src（按 src 记录；src 一变即自然失效，无需同步 reset）。
  const [errorSrc, setErrorSrc] = useState<string | null>(null)

  // 视口门控：NodeViewWrapper 是空的行内 span（尺寸为 0），故观察其父块（段落）——
  // 几何稳定，且与图片所在行的可见性一致。rootMargin 上下各扩 400px 提前预取。
  const wrapperRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (isExternal || imageId === null || nearViewport) return undefined
    const wrapper = wrapperRef.current
    if (!wrapper) return undefined
    const target = wrapper.parentElement ?? wrapper
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setNearViewport(true)
        observer.disconnect()
      },
      { rootMargin: '400px 0px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [imageId, isExternal, nearViewport])

  useEffect(() => {
    if (isExternal || imageId === null || !nearViewport) return undefined

    let cancelled = false
    let objectUrl: string | null = null
    const cacheKey = `image:${imageId}`
    const attach = (blob: Blob): void => {
      objectUrl = URL.createObjectURL(blob)
      setUpload({ forId: imageId, url: objectUrl, failed: false })
    }

    const cached = getCachedImage(cacheKey)
    if (cached) {
      attach(cached)
    } else {
      void window.api.images
        .get(imageId)
        .then((payload) => {
          if (cancelled) return
          if (!payload) {
            setUpload({ forId: imageId, url: null, failed: true })
            return
          }
          const blob = new Blob([bytesOf(payload.data)], { type: payload.mime })
          setCachedImage(cacheKey, blob)
          attach(blob)
        })
        .catch(() => {
          if (!cancelled) setUpload({ forId: imageId, url: null, failed: true })
        })
    }

    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [imageId, isExternal, nearViewport])

  // 解析应渲染的 src 与缺图态（渲染期派生，无副作用）。
  let src: string | null = null
  let missing = false
  if (isExternal) {
    src = rawSrc
  } else if (imageId === null) {
    missing = true
  } else if (upload !== null && upload.forId === imageId) {
    if (upload.url !== null) src = upload.url
    else missing = true
  }
  const broken = src !== null && errorSrc === src

  const className = `wf-editor-image-node node-image${selected ? ' is-selected' : ''}`

  return (
    <NodeViewWrapper as="span" className={className} ref={wrapperRef}>
      {src !== null && !broken ? (
        <img
          className="wf-editor-image"
          src={src}
          alt={alt}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setErrorSrc(src)}
        />
      ) : missing || broken ? (
        <span
          className="wf-editor-image-missing"
          role="img"
          aria-label={t('format.image.missingAlt')}
        >
          <span className="wf-editor-image-missing__glyph" aria-hidden="true">
            🖼
          </span>
          <span className="wf-editor-image-missing__text">{t('format.image.missingAlt')}</span>
        </span>
      ) : null}
    </NodeViewWrapper>
  )
}

export default ImageNodeView
