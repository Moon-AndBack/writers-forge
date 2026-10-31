/**
 * preload 类型域 · **数据健康自检**（主进程 `database/diagnostics`）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 超 §3 的 500 行上限）。
 * **单一真源**：经 `import type` 从主进程数据层取用，不逐字镜像
 * （理由见 `database.d.ts` 文件头——`import type` 编译期擦除，不污染 renderer bundle）。
 *
 * `DiagnosticsIssueCode` 为**字面量联合**，渲染层据此以模板字面量精确映射到
 * `diagnostics` ns 的 `issue.<code>.title` / `.detail`（i18n key 类型安全）。
 */

import type {
  DiagnosticsIssue,
  DiagnosticsIssueCode,
  DiagnosticsReport
} from '../../main/database/diagnostics'

export type { DiagnosticsIssue, DiagnosticsIssueCode, DiagnosticsReport }
