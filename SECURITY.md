# 安全说明

本文件记录 Writer's Forge 当前已知的依赖安全风险、判定依据与处置口径，并说明 CI / 发布检查使用哪条门禁命令。风险清单随依赖升级同步维护。

## 当前已知风险

| ID                                    | 影响包                                                                                                                       | 严重度                                    | 影响范围                                                                                                                                                                                                                                                                | 运行时可达性                                                                 | 处置                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| CVE-2026-118764 / GHSA-g3hv-75wg-m249 | `minimatch < 11.0.1`（`npm install` / `npm audit` 报出 27 条条目，实为同一 advisory 在依赖图中的 27 个节点，全部是传递依赖） | moderate（CVSS 6.9，仅影响 Availability） | 仅 devDependencies：eslint 工具链（eslint 10、typescript-eslint 8、@eslint/config-array）与 electron-builder 工具链（app-builder-lib、dmg-builder、@electron/asar、@electron/universal、electron-winstaller、ejs、jake、filelist、temp、glob 7、rimraf 2、dir-compare） | 否——生产依赖链 0 条（`npm audit --omit=dev` 为 0），打包产物 `out/` 不含该包 | 接受，待上游升级后复检 |

## 为什么接受

- 该漏洞要求攻击者控制传给 minimatch 的 glob 模式（恶意模式触发二次方配对比较，形成 DoS）。本项目所有 glob 均来自仓库内配置（`eslint.config.mjs`、`electron-builder.yml`）与构建工具的固定路径，属可信输入，不存在外部注入面。
- 仅在两处本地工具链执行时可达：`npm run lint` 与 `npm run build:win`。运行时不可达：`npm audit --omit=dev` 报告 0 条，`npm ls minimatch --omit=dev` 为空，打包产物中不含该包，用户侧无任何可触发路径。
- 上游暂无可用修复版本：eslint 10.x、electron-builder 26.x、@electron/asar、glob、dir-compare、filelist、temp 的最新发布仍依赖 minimatch ≤ 10，且 minimatch 没有 10.x 回补版。任何「修复」都会跨主版本强推（`npm audit fix` 的 `fixAvailable` 给出的全是降级建议，照做会破坏现有工具链）。
- 用全局 `overrides` 强推到 minimatch ≥ 11 会实际破坏打包：`dir-compare@4.x` 依赖 minimatch 3 的「模块即函数」导出形态，v11 取消了 default export，调用即抛 TypeError，直接打断 macOS 打包路径。代价高于收益。

## 门禁口径

- CI 与发布检查统一使用 `npm audit --omit=dev` 作为依赖安全门禁（当前结果为 0 条，必须保持为 0）。
- 不以全量 `npm audit` 作为阻断条件：其输出包含 devDependencies 工具链的已知、已评估风险，全量阻断会让流水线长期红而失去信号价值。
- `npm audit --omit=dev` 一旦出现条目，视为新风险或风险已扩散到生产链，必须立即排查并按本文维护约定登记。

## 复检触发条件

出现以下任一情况时，重新评估本条目并更新本文档：

- eslint 10.x 的发布说明中出现 minimatch ≥ 11 / glob 14 及以上的依赖升级；
- electron-builder 26.x 的发布说明中出现 minimatch ≥ 11 / glob 14 及以上的依赖升级；
- 传递链上其它包（@electron/asar、dir-compare、filelist、temp、rimraf 等）先行移除对 minimatch ≤ 10 的依赖；
- minimatch 发布 10.x 回补版，或 CVE-2026-118764 的严重度评级 / 可利用条件发生变更。

## 维护约定

- 新增已知风险、或某条风险解除时，同步更新「当前已知风险」表格。
- 每次更新在文末刷新核对日期；复检结论与依赖版本一并记录，不另建清单文件。
- 依赖树变化（`package-lock.json` 更新）后，至少复核一次 `npm audit --omit=dev` 结果。

---

核对日期：2026-11-01
