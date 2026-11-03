/**
 * en **写作域**资源汇总（按需加载）：与 zh-CN 的 `writerResources.ts` 同结构。
 * `satisfies ZhCNWriterResources` 保证 key 全等（缺 key / 多 key 均报错）。
 *
 * 加载时机同 zh-CN：仅由 `../../index` 的 `WRITER_LOADERS` 动态 `import()`，
 * 不进入入口语言包 chunk。
 */
import type { ZhCNWriterResources } from '../zh-CN/writerResources'
import chapters from './chapters'
import dossier from './dossier'
import entities from './entities'
import outline from './outline'
import plot from './plot'
import timeline from './timeline'
import writer from './writer'

const enWriter = {
  chapters,
  dossier,
  entities,
  outline,
  plot,
  timeline,
  writer
} satisfies ZhCNWriterResources

export default enWriter
