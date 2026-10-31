import { useEffect, useRef, useState } from 'react'
import type { WorldEntityType } from '../../../../../preload/types/worldEntity'

/**
 * 剧情正文实体匹配 hook：正文**纯文本** → `entities:match`（词表取统一设定库主表） → 按实体去重 → 胶囊数据。
 *
 * 口径（对齐章节正文实体高亮 `EntityHighlight`）：
 * - **实时、不落库**：匹配结果只驱动卡片胶囊渲染，不写回 `plot_scenes`（`characters` 列已下线）；
 * - **纯尾沿防抖 500ms**：每次文本 / 书变更都重置定时器，**停笔 500ms 后**才发起一次
 *   整段匹配（无前沿立即触发，避免逐键发起）；
 * - **去重**：同一实体在正文多次出现（含经别名命中）只保留**首次出现**一项，
 *   顺序即正文出现顺序（`entities:match` 已按 `start` 升序返回）；
 * - **竞态防护**：文本 / 书变更后，上一轮未返回的结果一律丢弃（`seq` 守卫），
 *   IPC 失败静默为空（下一次输入会再次触发）。
 */

/** 胶囊数据项（与 preload `EntityMatch` 结构对齐，此处独立声明避免类型耦合）。 */
export interface PlotBodyEntity {
  entityId: number
  /** 命中的词（实体名或别名原文，即正文中的匹配文字）。 */
  name: string
  /** 统一设定库五类（直接复用 preload 类型）。 */
  type: WorldEntityType
  /**
   * 子类分类外键（`world_entities.subtype_id`）；`null` = 未分类。
   * 保留字段：下游仍携带，但不再参与配色——胶囊颜色由下方的 `presetKey` 决定。
   */
  subtypeId: number | null
  /**
   * 子类预设路由键（`world_subtypes.preset_key`）；空串 = 自定义分类或未分类。
   * 供胶囊按 23 个预设子类各取独立颜色（自定义分类回落模块色）。
   */
  presetKey: string
}

/** 尾沿防抖（ms）：与章节正文实体高亮同一档，停笔 500ms 后触发整段匹配。 */
const MATCH_DEBOUNCE_MS = 500

/** 无匹配 / 无书籍时的恒等空数组（引用稳定，避免下游按长度签名重测）。 */
const EMPTY_ENTITIES: PlotBodyEntity[] = []

/** 按 `entityId` 去重（保留首次出现；入参已按正文出现顺序排序）。 */
function dedupeByEntityId(matches: readonly PlotBodyEntity[]): PlotBodyEntity[] {
  const seen = new Set<number>()
  const result: PlotBodyEntity[] = []
  for (const match of matches) {
    if (seen.has(match.entityId)) continue
    seen.add(match.entityId)
    result.push({
      entityId: match.entityId,
      name: match.name,
      type: match.type,
      // 去重时重建对象，保留字段一并带上（下游仍携带，但不参与配色）。
      subtypeId: match.subtypeId,
      // 预设路由键同理必须一并带上，否则下游取不到预设子类颜色。
      presetKey: match.presetKey
    })
  }
  return result
}

/**
 * 匹配 `text` 中的实体（按 `bookId` 隔离），返回去重后的胶囊数据。
 * `bookId` 为空串（不可匹配）或 `text` 为空时恒返回空数组，且不发起 IPC。
 */
export function usePlotBodyEntities(bookId: string, text: string): PlotBodyEntity[] {
  const [matched, setMatched] = useState<PlotBodyEntity[]>(EMPTY_ENTITIES)
  // 最新入参（尾沿定时器可能由更早一轮 effect 挂出，须在触发时读最新文本 / 书；在 effect 内写）。
  const latestRef = useRef({ bookId, text })
  // 尾沿定时器：非空即表示「已有挂起的整段匹配，等待停笔到期」。
  const timerRef = useRef<number | null>(null)
  // 请求序号：仅最新一轮结果可写回（丢弃乱序 / 过期响应）。
  const seqRef = useRef(0)

  useEffect(() => {
    latestRef.current = { bookId, text }
    // 不可匹配（无书 / 空正文）：取消在途与尾沿；返回值恒为空数组（见函数末尾）。
    if (bookId === '' || text === '') {
      seqRef.current += 1
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const run = (): void => {
      timerRef.current = null
      const seq = ++seqRef.current
      const { bookId: bid, text: txt } = latestRef.current
      if (bid === '' || txt === '') return
      void window.api.entities
        .match(bid, txt)
        .then((matches) => {
          if (seq !== seqRef.current) return
          setMatched(dedupeByEntityId(matches))
        })
        .catch(() => {
          if (seq === seqRef.current) setMatched(EMPTY_ENTITIES)
        })
    }

    // 纯尾沿防抖：每次变更都重置定时器，停笔 500ms 后触发一次整段匹配。
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(run, MATCH_DEBOUNCE_MS)
  }, [bookId, text])

  // 卸载清理：取消在途与尾沿，避免卸载后写回。
  useEffect(() => {
    return () => {
      seqRef.current += 1
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return bookId === '' || text === '' ? EMPTY_ENTITIES : matched
}
