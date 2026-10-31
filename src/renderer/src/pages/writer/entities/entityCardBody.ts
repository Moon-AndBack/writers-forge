/**
 * 悬停卡正文分段（HoverCard 专用小工具）。
 *
 * 拆出本文件的理由：`HoverCard.tsx` 已接近 500 行硬上限，纯函数外置后组件只留调用点。
 * 入参用最小结构而非 `EntityDetail`，避免与 `HoverCard.tsx` 形成循环引用。
 */

import { docJsonToParagraphs } from '../../../../../shared/richTextDoc'

/** 正文解析入参：只依赖卡片展示所需的两列正文。 */
export interface EntityCardBodySource {
  /** 纯文本摘要（`world_texts.body`，无段落边界）。 */
  body: string
  /** 富文本正文 JSON（`world_texts.body_json`，空串 = 尚未富文本化）。 */
  bodyJson: string
}

/** 优先按 bodyJson 分段；未富文本化（空串 / 解析失败）时回退为单段 body。 */
export function resolveBodyParagraphs(detail: EntityCardBodySource): string[] {
  const paragraphs = docJsonToParagraphs(detail.bodyJson)
  if (paragraphs.length > 0) return paragraphs
  const fallback = detail.body.trim()
  return fallback === '' ? [] : [fallback]
}
