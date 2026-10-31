import { useEffect, useState } from 'react'
import { createLogger } from '@renderer/lib/log'

/** 右栏大纲预读日志（转发至主进程落盘）。 */
const log = createLogger('outlinePreview')

/** 预读目标种类：条目正文（`scope='entry'`）/ 卷纲（`scope='volume'`）。 */
export type OutlinePreviewKind = 'entry' | 'volume'

/**
 * 预读状态：
 * - `idle`：未选中（`id === null`），无需读取；
 * - `loading`：已发起读取、结果未回（**不保留上一次的正文**）；
 * - `ready`：读到非空正文；
 * - `empty`：行不存在 / 已软删 / 正文为空。
 */
export type OutlinePreviewStatus = 'idle' | 'loading' | 'ready' | 'empty'

/** 预读结果（供只读富文本直接消费）。 */
export interface OutlinePreview {
  status: OutlinePreviewStatus
  contentJson: string | null
}

export interface UseOutlinePreviewOptions {
  /** 读取通道：条目走 `outline:getContent`，卷走 `outline:getVolumeOutline`。 */
  kind: OutlinePreviewKind
  /** 目标行 id（条目 id / 卷 id）；null = 未选中。 */
  id: number | null
}

/** 已定稿的读取结果：`key` 记录它属于哪一次请求（竞态 / 过期结果的唯一判据）。 */
interface PreviewResult {
  key: string
  status: 'ready' | 'empty'
  contentJson: string | null
}

const IDLE: OutlinePreview = { status: 'idle', contentJson: null }
const LOADING: OutlinePreview = { status: 'loading', contentJson: null }

/**
 * 右栏只读正文预读：选中条目 / 卷时**按 id 现取**正文（不信任列表行里的
 * `contentJson`——中栏保存不会触发列表 reload，列表副本可能过期）。
 *
 * 竞态处理：每次请求带 `kind:id` 作为 `key`，只有与**当前**请求 key 相同的结果
 * 才会被采用；其余（旧选中项的迟到响应）在渲染期被丢弃并显示 `loading`。
 * 因此切换下拉时**不会短暂显示上一条正文**。
 */
export function useOutlinePreview({ kind, id }: UseOutlinePreviewOptions): OutlinePreview {
  // 当前请求 key（'' = 无选中）；id 变化即变化，作为结果归属判据。
  const requestKey = id === null ? '' : `${kind}:${id}`
  const [result, setResult] = useState<PreviewResult | null>(null)

  useEffect(() => {
    if (id === null) return undefined
    const key = `${kind}:${id}`
    let cancelled = false

    void (async () => {
      try {
        const api = window.api?.outline
        if (!api) {
          if (!cancelled) setResult({ key, status: 'empty', contentJson: null })
          return
        }
        const payload = kind === 'entry' ? await api.getContent(id) : await api.getVolumeOutline(id)
        if (cancelled) return
        const contentJson = payload?.contentJson ?? null
        setResult({
          key,
          status: contentJson !== null && contentJson.trim() !== '' ? 'ready' : 'empty',
          contentJson
        })
      } catch (error) {
        log.warn('右栏大纲正文读取失败', error)
        if (!cancelled) setResult({ key, status: 'empty', contentJson: null })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [kind, id])

  if (id === null) return IDLE
  // 结果不属于当前请求（首次读取 / 已切换选中）→ 一律按读取中处理，不暴露旧正文。
  if (result === null || result.key !== requestKey) return LOADING
  return { status: result.status, contentJson: result.contentJson }
}
