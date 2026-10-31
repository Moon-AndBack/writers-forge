/**
 * en 资源汇总：与 zh-CN 同结构。
 * `satisfies ZhCNResources` 提供双向约束——缺 key 或多余 key 都会在类型检查报错，
 * 从而保证与 zh-CN 的 key 全等（值可不同，即翻译）。
 */
import type { ZhCNResources } from '../zh-CN'
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

const en = {
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
} satisfies ZhCNResources

export default en
