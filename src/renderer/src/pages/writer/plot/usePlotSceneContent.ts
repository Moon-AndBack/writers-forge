import { useCallback, useEffect, useRef, useState } from 'react'
import { createLogger } from '@renderer/lib/log'

/** 剧情正文读取日志（转发至主进程落盘）。 */
const log = createLogger('plot')

/**
 * 单场景正文载荷（`plot:getSceneContent` 的正文两列）。
 * `descriptionJson` = 整条块级 Tiptap JSON（`null` = 空正文）；
 * `description` = 由 JSON 派生的纯文本摘要（老数据兜底 / 只读展示）。
 */
export interface PlotSceneContent {
  descriptionJson: string | null
  description: string
}

export interface UsePlotSceneContentResult {
  /** 正文（未加载 / 未激活 / 失败时为 null，调用方据此显示加载态而非空正文）。 */
  content: PlotSceneContent | null
  /** 正在读取（`active` 且尚无正文且未失败）。 */
  loading: boolean
  /** 最近一次读取失败（与当前 `sceneId` 对应；重试成功即清除）。 */
  error: boolean
  /** 重新读取（清缓存 + 重发请求）。 */
  reload: () => void
}

/** 失败归属（切场景后旧失败不再算当前场景的错误）。 */
interface FailureSnapshot {
  sceneId: number
}

/**
 * 会话内正文缓存：场景 id → 正文。
 *
 * 列表接口已投影掉 `description_json`（见主进程 `PLOT_SCENE_LIST_COLUMNS`），正文改按 id
 * 读取；同一场景在未失效前不重复请求。**保存成功后必须更新缓存**（见
 * `invalidatePlotSceneContent`），否则下一次挂载（切走再回来 / 放弃草稿）会读到旧正文，
 * 编辑器随后保存就会把旧正文写回库。
 */
const contentCache = new Map<number, PlotSceneContent>()

/**
 * 失效正文缓存：`next` 缺省 = 删除（下次挂载重读）；传入 = 直接换成刚落库的正文
 * （保存成功时使用，避免「读到旧正文」或为刷新再走一次 IPC）。
 */
export function invalidatePlotSceneContent(sceneId: number, next?: PlotSceneContent): void {
  if (next === undefined) contentCache.delete(sceneId)
  else contentCache.set(sceneId, next)
}

/**
 * 单场景正文懒取（对齐大纲 `outline:getContent` 的「摘要行 + 按需正文」口径）。
 *
 * - `active` 为假（模块不在前台）时不发请求，避免常驻右栏空拉；
 * - 同一 `sceneId` 命中缓存不重复请求（缓存更新由保存方显式调用
 *   `invalidatePlotSceneContent`）；
 * - 请求带序号守卫：场景 / 激活态 / 重试任一变化都作废在途响应，旧响应不回写缓存、
 *   不改状态（快速切场景不会出现「上一个场景的正文覆盖当前场景」）；
 * - 正文以**缓存**为准（非组件内快照）：保存方更新缓存后，其它挂载点（时间线只读详情）
 *   下次渲染即拿到新正文，不会残留旧值。
 */
export function usePlotSceneContent(
  sceneId: number | null,
  active: boolean
): UsePlotSceneContentResult {
  // 读取完成信号：缓存更新后强制重渲染（缓存本体是模块级 Map，渲染时按 id 直接读取）。
  const [, bumpContentVersion] = useState(0)
  const [failure, setFailure] = useState<FailureSnapshot | null>(null)
  // 重试信号：递增触发重发（`reload` 同时清掉该场景缓存）。
  const [reloadToken, setReloadToken] = useState(0)
  // 请求序号：只有最新一次请求的响应可回写（旧响应丢弃）。
  const requestSeqRef = useRef(0)

  useEffect(() => {
    // 场景 / 激活态 / 重试信号任一变化都作废在途响应（序号守卫的唯一递增点）。
    const seq = ++requestSeqRef.current
    if (sceneId === null || !active) return undefined
    // 缓存命中：正文经下方 `content` 直接可见，不再请求（也不触发状态写入）。
    if (contentCache.has(sceneId)) return undefined
    void (async () => {
      try {
        // 重新请求：先清掉上一次失败态（错误只在本次请求失败后重新标记）。
        setFailure(null)
        const row = await window.api?.plot.getSceneContent(sceneId)
        // 序号守卫：快速切场景时旧响应一律丢弃（不回写缓存、不改状态）。
        if (requestSeqRef.current !== seq) return
        if (!row) throw new Error(`剧情场景正文缺失（sceneId=${sceneId}）`)
        contentCache.set(sceneId, {
          descriptionJson: row.descriptionJson,
          description: row.description
        })
        bumpContentVersion((value) => value + 1)
      } catch (error) {
        if (requestSeqRef.current !== seq) return
        log.warn('读取剧情场景正文失败', error)
        setFailure({ sceneId })
      }
    })()
    return undefined
  }, [sceneId, active, reloadToken])

  // 正文以缓存为准：渲染时按 id 读取（未激活 / 未读取 = null）。
  const content = sceneId === null || !active ? null : (contentCache.get(sceneId) ?? null)

  const error = active && content === null && failure !== null && failure.sceneId === sceneId
  const loading = sceneId !== null && active && content === null && !error

  const reload = useCallback((): void => {
    if (sceneId === null) return
    // 手动重读：先让失败态复位（重发前清掉，避免立刻又判失败），并清缓存触发实际读取。
    setFailure((prev) => (prev?.sceneId === sceneId ? null : prev))
    contentCache.delete(sceneId)
    setReloadToken((token) => token + 1)
  }, [sceneId])

  return { content, loading, error, reload }
}
