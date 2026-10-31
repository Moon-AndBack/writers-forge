/**
 * i18next 类型增强：以 zh-CN 资源为真源，为 `t()` 提供 key 补全与校验。
 * 非运行时代码，仅参与类型检查（被 tsconfig.web 的 include 覆盖）。
 */
import type { ZhCNResources } from './locales/zh-CN'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: ZhCNResources
  }
}
