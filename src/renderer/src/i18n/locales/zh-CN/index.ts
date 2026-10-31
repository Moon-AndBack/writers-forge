/**
 * zh-CN 资源汇总：命名空间（ns）→ 资源对象。
 * 以本文件的结构与 key 作为 i18n 的**真源**——en 通过 `satisfies ZhCNResources`
 * 保证 key 全等；i18next 的类型增强（见 ../../types.d.ts）亦取此结构。
 * 新增命名空间时同步在 en/ 下建同名文件并在此登记。
 */
import ai from './ai'
import bookshelf from './bookshelf'
import chapters from './chapters'
import common from './common'
import diagnostics from './diagnostics'
import dossier from './dossier'
import entities from './entities'
import module from './module'
import onedrive from './onedrive'
import outline from './outline'
import plot from './plot'
import settings from './settings'
import status from './status'
import theme from './theme'
import timeline from './timeline'
import titlebar from './titlebar'
import typography from './typography'
import welcome from './welcome'
import writer from './writer'

const zhCN = {
  ai,
  bookshelf,
  chapters,
  common,
  diagnostics,
  dossier,
  entities,
  module,
  onedrive,
  outline,
  plot,
  settings,
  status,
  theme,
  timeline,
  titlebar,
  typography,
  welcome,
  writer
}

/** zh-CN 资源结构类型（key 真源，供 en 与类型增强引用）。 */
export type ZhCNResources = typeof zhCN

export default zhCN
