# 违禁词库规范

Writer's Forge 的违禁词库是**全局共享**（不含 `book_id`）的提示词表：正文命中后只加红色波浪下划线，不改正文、不拦输入、不影响保存。本文说明类别、内置词来源与许可、生成清洗规则、检测口径与按类别批量启停。

真源声明：类别枚举以 `src/main/database/cleanWordCategories.ts` 为准；种子与计数以 `src/main/database/cleanWordSeed/`（`meta.ts` 为元信息）为准；表结构以 `src/main/database/schema/cleanWords.ts` 为准；检测以 `src/renderer/src/pages/writer/chapters/proofreadMark.ts` 为准；界面文案以 `chapters` 命名空间的 `cleanWords.*` 为准。文档只做解释，冲突一律以代码为准。

## 1. 九个类别

类别顺序即词库下拉、表头与筛选的展示顺序。`other` 为兜底类别，**不内置词条**，只承接用户自建词。

| 键            | 界面名   | 内置条数 | 范围说明                               |
| ------------- | -------- | -------- | -------------------------------------- |
| `sexual`      | 色情     | 320      | 色情 / 情色内容                        |
| `minorSexual` | 未成年性 | 25       | 未成年色情（法定红线，从严提示）       |
| `gambling`    | 赌博     | 120      | 赌博 / 博彩 / 赌场话术                 |
| `drug`        | 毒品     | 104      | 毒品、制毒、吸毒工具与黑话             |
| `fraud`       | 诈骗     | 270      | 诈骗手法与反诈话术（批判性提及也命中） |
| `violence`    | 暴力     | 70       | 暴力、血腥、虐待                       |
| `weapon`      | 武器     | 260      | 枪爆、改装武器、管制器具               |
| `minor`       | 未成年   | 105      | 诱导未成年、针对未成年人的不良引导     |
| `other`       | 其他     | 0        | 用户兜底类别，不内置                   |

合计内置 **1274** 条。政治类**不内置**；`political` / `profanity` / `ads` 等旧类别在迁移时，用户词条统一并入 `other` 且字段全部保留；旧内置词由种子 v2 重新归类。

## 2. 来源与许可

内置词表随程序版本发布，**不联网**、不做后台自动更新。生成于 2026-11-10，版本 `v2`。

| 来源  | 仓库 / 说明                                                        | 许可       | 采用条数 |
| ----- | ------------------------------------------------------------------ | ---------- | -------- |
| fwwdn | `github.com/fwwdn/sensitive-stop-words`（固定 commit）             | Apache-2.0 | 195      |
| houbb | `github.com/houbb/sensitive-word-data`（固定 commit）              | Apache-2.0 | 531      |
| 自建  | 反诈 / 诱导未成年 / 极端暴力 / 改装武器 / 赌博毒品补充，随仓库维护 | MIT        | 548      |

合计 1274 条（去重后单归属）。两个外部词库均为 Apache-2.0；自建部分为本项目原创，按 MIT 发布。词表在仓库内以静态种子文件分发，运行期不请求网络。

界面说明：违禁词库弹窗**已不再展示出处行**（原位于结果区计数行下方）。原文案为「来源：{{sources}}（{{licenses}}）· 更新于 {{date}}」，其中 `sources` 依次为 fwwdn / houbb / 自建，`licenses` 为 Apache-2.0 / Apache-2.0 / MIT，日期取内置词表生成日；来源、许可与日期统一以本文档为出口。

## 3. 生成与清洗

生成脚本：`scripts/build-clean-word-seed.mjs`（辅助模块在 `scripts/clean-words/`），支持 `--report` / `--check`。固定上游 commit 拉取后执行：

1. **排除政治类**：丢弃上游 `tag0`（政治）以及含 `tag0` 的多标签词；
2. **排除模板话术、网址、电话、长数字**；
3. **排除纯英文 / 数字 token**（保留 `TNT` / `LSD` / `AK47` 等白名单）；
4. **排除正常词黑名单**（如「小姐」「彩票」「枪手」「硝酸甘油」等易误伤词）；
5. **单字根展开为复合词**（如「巨乳」「蜜穴」「吞精」），避免「精神」「阴天」「穴位」误伤；
6. **单归属去重 + 每类上限 + 质量分排序**，输出 `src/main/database/cleanWordSeed/<category>.ts`。

种子生成结果是提交进仓库的静态数据，运行时不联网、不重新生成。

## 4. 检测口径

- 只取 `enabled = 1` 的词（`cleanWords:active`）；
- **纯词匹配，不做语境判断**：只要文本中出现词表里的词就标记，因此批判性提及（如「反对赌博」「毒品危害」）同样会命中；命中不等于内容违规，需人工复核；
- 大小写敏感、按原文精确匹配；同一位置**最长匹配优先**，命中区间互不重叠；
- 按文本块（段落 / 标题等）逐块扫描，停笔约 0.5 秒重扫，切章立即扫一次；
- 添加词条时要求 2～100 字、不含换行；少于 2 字不入库，因为正文标记会跳过单字词。

## 5. 添加词条（批量添加）

弹窗第三行「添加」支持一次写入多条：

- **分隔符**：中文逗号（`，`）或英文逗号（`,`）均可混用；**不支持**中文顿号（`、`）——顿号常出现在正常短语中，误拆风险高；
- **逐段规整**：每段先 `trim`（含全角空格与 NBSP），丢弃空段，再按输入顺序去重（保留首次出现位置）；
- **同属所选类别**：整批词条写入类别下拉的当前值；
- **全有或全无**：任一词条含换行、少于 2 字或超过 100 字时整批拦截、不发请求；单条 / 多条分别给出行内提示；
- **结果提示**：按新增 / 已存在分别提示；重复词不报错，内置词会更新为所选类别，自建词保留原类别；
- 含逗号的词无法再通过界面新增（逗号被视为分隔符）；数据库中已存在的含逗号用户词不受影响，仍按原词参与检测。

## 6. 按类别批量启停

词库弹窗中筛选到某个**具体类别**且该类别存在内置词时，计数行右侧出现批量按钮：

- 该类别尚有启用中的内置词 → 显示「禁用本类别内置词」；
- 该类别内置词全部已禁用 → 显示「启用本类别内置词」；
- 点击后先弹确认框，写明类别名与将影响的条数（禁用语气为危险色）；
- 确认后只更新 `source = 'builtin'` 且类别匹配的行，**用户自建词不受影响**；
- IPC 通道 `cleanWords:setCategoryEnabled`，返回实际变更行数（失败为 `-1`）；成功后词库缓存失效，已打开的正文立即重扫。

## 7. 数据模型与迁移

表 `clean_word_list`：`word` 唯一、`category` / `source` / `enabled` 均有 SQL CHECK，`sort_order` 为展示顺序真源，`updated_at` 写入时刷新。

- `source = 'builtin'`：只能禁用、不能删除；词库升级时按种子同步；
- `source = 'user'`：用户自建，可删除；升级时字段与启停状态都不被覆盖；
- 守卫键 `cleanWords:seed:v2`：同步时导入新种子、删除已下线的 builtin 行、重排 `sort_order`；**用户自建词永不删除**；`v1` 键保留为历史记录；
- 旧类别 `political` / `profanity` / `ads` 通过 `toCleanWordCategory` 映射：用户词条并入 `other`，旧内置词由种子 v2 重新归类。

## 8. 相关文件

- 主进程数据层：`src/main/database/cleanWords.ts`、`cleanWordCategories.ts`、`cleanWordSeed/`
- 表与迁移：`src/main/database/schema/cleanWords.ts`
- IPC / preload：`src/main/ipc/cleanWords.ts`、`src/preload/api/cleanWords.ts`
- 渲染层：`src/renderer/src/components/dialogs/CleanWordsDialog.tsx`、`useCleanWordsLibrary.ts`、`cleanWordsMeta.ts`、`CleanWordsTable.tsx`
- 正文标记：`src/renderer/src/pages/writer/chapters/proofreadMark.ts`、`CleanWordHitsPill.tsx`
- 文案：`src/renderer/src/i18n/locales/{zh-CN,en}/chapters.ts` 的 `cleanWords.*`

最后核对：2026-11-14
