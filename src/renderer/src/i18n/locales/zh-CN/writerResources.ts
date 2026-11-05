/**
 * zh-CN **写作域**资源汇总（按需加载）：仅 `pages/Writer` 及其子图使用的命名空间。
 *
 * 拆分动机：书架 / 欢迎页首屏不需要这 9 个 ns（合计约占语言包 3/4 体积），
 * 故本文件作为**独立模块**存在，只由 `../../index` 的 `WRITER_LOADERS` 动态
 * `import()`——与 core 语言包各自成 chunk。**禁止**被 `./index` 静态导入，
 * 否则两者会合并回同一 chunk，拆分失效。
 *
 * 类型上 `./index` 以 `typeof import('./writerResources').default` 并入
 * `ZhCNResources`（全量真源），保证 `t()` 的 key 补全仍覆盖写作域。
 */
import chapters from './chapters'
import dossier from './dossier'
import entities from './entities'
import foreshadow from './foreshadow'
import inspiration from './inspiration'
import outline from './outline'
import plot from './plot'
import timeline from './timeline'
import writer from './writer'

const zhCNWriter = {
  chapters,
  dossier,
  entities,
  foreshadow,
  inspiration,
  outline,
  plot,
  timeline,
  writer
}

/** zh-CN 写作域资源结构类型（供 en 同名模块 `satisfies` 约束）。 */
export type ZhCNWriterResources = typeof zhCNWriter

export default zhCNWriter
