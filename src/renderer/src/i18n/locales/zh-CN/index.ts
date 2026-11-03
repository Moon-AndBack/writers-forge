/**
 * zh-CN 资源汇总：
 * - `default` = **入口语言包（core ns）**：App / 书架 / 欢迎页 / 外壳 / 设置弹窗首屏即用；
 * - `./writerResources` = **写作域语言包**：仅写作页使用的 ns，由 `../../index` 动态加载，
 *   不静态导入本文件（否则会与 core 合并成同一 chunk）。
 *
 * 以本文件的结构与 key 作为 i18n 的**真源**——`ZhCNResources` 为两者的并集，
 * en 通过 `satisfies` 保证 key 全等；i18next 的类型增强（见 ../../types.d.ts）取全量结构，
 * 故 `t()` 对写作域 key 的补全不因拆分而退化（类型查询运行期擦除，不影响打包）。
 * 新增命名空间时同步在 en/ 下建同名文件，并按用途登记到本文件或 `./writerResources`。
 */
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

/** 入口语言包（core ns）：首屏与全局外壳所需，initI18n / 语言切换必加载。 */
const zhCN = {
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
}

/** 入口语言包结构类型（en/ 同名汇总 `satisfies` 此类型）。 */
export type ZhCNCoreResources = typeof zhCN

/**
 * 全量资源结构类型（core ∪ 写作域）：i18next 类型增强与各 ns 的 en `satisfies` 的唯一真源。
 * `typeof import(...)` 为纯类型查询，编译后擦除，不会把 writer 模块拉进入口模块图。
 */
export type ZhCNResources = typeof zhCN & typeof import('./writerResources').default

export default zhCN
