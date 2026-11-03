/**
 * en 入口语言包（core ns）汇总：与 zh-CN `index.ts` 的 core 部分同结构。
 * `satisfies ZhCNCoreResources` 提供双向约束——缺 key 或多余 key 都会在类型检查报错。
 * 写作域 ns 见 `./writerResources.ts`（按需加载，不进入本 chunk）。
 */
import type { ZhCNCoreResources } from '../zh-CN'
import ai from './ai'
import bookshelf from './bookshelf'
import common from './common'
import diagnostics from './diagnostics'
import module from './module'
import onedrive from './onedrive'
import settings from './settings'
import status from './status'
import theme from './theme'
import titlebar from './titlebar'
import typography from './typography'
import welcome from './welcome'

const en = {
  ai,
  bookshelf,
  common,
  diagnostics,
  module,
  onedrive,
  settings,
  status,
  theme,
  titlebar,
  typography,
  welcome
} satisfies ZhCNCoreResources

export default en
