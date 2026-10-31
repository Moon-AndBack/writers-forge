# 设计令牌（Design Tokens）

本文描述 `src/renderer/src/styles/theme.css` 的令牌体系：单一真源的组织、主题标识与 `system` 解析、主题无关令牌、四套主题的分组与差异、不透明令牌与窗口材质的配合、系统强调色、主题切换过渡、样式导入顺序与使用规约。

- 令牌定义：`src/renderer/src/styles/theme.css`（357 行，165 条声明）
- 主题标识 / 解析：`theme/themes.ts`、`theme/ThemeProvider.tsx`；系统强调色：`theme/useSystemAccent.ts`、`theme/color.ts`、`src/main/theme.ts`、`src/main/ipc/theme.ts`
- 切换过渡：`theme/themeReveal.ts`、`styles/components/motion.css`；材质 / 外壳：`styles/acrylic.css`、`styles/shell.css`；入口：`styles/index.css`、`App.tsx`

---

## 1. 单一真源与文件结构

全部颜色、圆角、字体、动效时长、层级与光斑令牌**只在** `theme.css` 声明，其他样式一律 `var(--x)` 取用。组件样式不定义同名令牌，也不写主题色字面量。

| 区块 | 选择器 | 行号 | 声明数 | 作用 |
| --- | --- | --- | --- | --- |
| 主题无关 | `:root` | 10-71 | 24 | 排版、圆角、字体、动效、层级、光斑、材质透明度、选区 |
| 亮色（默认） | `:root, [data-theme='light']` | 74-157 | 37 | 亮色主题，同时是全部主题的**基底** |
| 暗色 | `[data-theme='dark']` | 160-229 | 35 | 暗色主题 |
| 浅绿 | `[data-theme='sage']` | 232-291 | 34 | 浅绿主题 |
| 浅黄 | `[data-theme='honey']` | 294-357 | 35 | 浅黄主题 |
| **合计** | — | — | **165** | — |

- **亮色块与 `:root` 同挂 `<html>`**：选择器是 `:root, [data-theme='light']`，任何主题下都会命中。sage / honey 块同为 0,1,0 特异性且排在后面，只覆盖自己声明的属性，**未声明项回退到亮色块**——这正是它们只有 34 / 35 条的原因（省略了 `--sh-xs`、`--sh-sm`、sage 的 `--overlay-mask` 等）。
- 每个主题块首行写 `color-scheme`（light / dark），驱动原生滚动条、表单控件与选区基线；块内分组顺序固定：桌面/窗口表面 → 交互底色 → 不透明交互底色 → 控件 on-soft → 文本 → 品牌/语义 → 正文 → 阴影/描边 → 遮罩 → 选区 → 兼容层。变量名沿用原型命名，仅 `--desk-3` 大小写被规范为小写。

> `theme.css` 顶部注释仍写「来源：template/index.html」。`template/` 已删除，**不得**再作为设计出处；以当前取值为准。

---

## 2. 主题标识与 `system` 解析

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `THEME_IDS` | `system`、`light`、`dark`、`sage`、`honey` | 用户可选项（`themes.ts:9`） |
| `ThemeId` / `ResolvedThemeId` | 五者联合 / 去掉 `system` | 前者含 `system`；后者是写入 `data-theme` 的值（`themes.ts:14`） |
| `DEFAULT_THEME` | `'system'` | 缺省档（`themes.ts:31`） |
| `THEME_SETTING_KEY` | `'theme'` | settings 表持久化键（`themes.ts:34`） |
| `isThemeId()` | 字符串守卫 | 校验持久化值（`themes.ts:36-38`） |

解析规则（`ThemeProvider.tsx:23-27`）：`system` 在系统深色时解析为 `dark`、否则 `light`；其余四档原样返回。系统明暗由 `useSyncExternalStore` 订阅 `(prefers-color-scheme: dark)`（`ThemeProvider.tsx:29-41`），切换实时生效。

- `data-theme` **只写解析结果**，绝不写 `system`（`ThemeProvider.tsx:55-61`）。四套主题块不需要也不应出现 `[data-theme='system']`。
- settings 保存的是**用户选择本身**（`ThemeProvider.tsx:66-69`），取值可以是 `system`；启动时 `main.tsx:34-42` 预取并经 `isThemeId` 校验后传入 `initialTheme`，避免异步读取造成闪屏。易混淆点：**`system` 会落库，但不会进 `data-theme`**——前者是偏好，后者是生效值。

---

## 3. 主题无关令牌（24 条）

`:root`（`theme.css:10-71`）中取值与主题无关的令牌：

| 变量 | 值 / 含义 | 用途 |
| --- | --- | --- |
| `--page-width` | `620px` | 正文栏最大宽度 |
| `--doc-font` | 系统默认字体栈 | 文档正文，与 `typographyContext.ts` 的 `DEFAULT_DOC_FONT` 逐字一致 |
| `--doc-line` | `2` | 正文行高倍数 |
| `--doc-zoom` | `1` | 正文缩放，`calc(16px * var(--doc-zoom))` |
| `--doc-letter` | `0.01em` | 正文字距 |
| `--r-xs` | `4px` | 小圆角（最常用，70+ 处） |
| `--r-lg` | `8px` | 大圆角 |
| `--r-window` | `8px` | 窗口级圆角（预留） |
| `--font` | Segoe UI Variable / 微软雅黑 / PingFang 栈 | 界面字体（挂在 `body`） |
| `--serif` | 宋体 / Source Han Serif / Georgia 栈 | 衬线字体（书封、摘录） |
| `--mono` | Cascadia Mono / Consolas 栈 | 等宽字体（代码、字数） |
| `--ease` | `cubic-bezier(0.33, 0, 0.67, 1)` | 对称缓动，交互与主题淡化共用 |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 进场专用（快出慢入） |
| `--dur-fast` | `120ms` | 微交互（hover / 图标态） |
| `--dur-base` | `180ms` | 通用交互与进出场 |
| `--dur-slow` | `240ms` | 展开 / 拖拽 / 主题淡化 |
| `--z-hover-card` | `970` | 悬停卡浮层 |
| `--z-popover` | `971` | 「+N」等浮窗 |
| `--z-popover-nested` | `972` | 嵌套详情卡 |
| `--desk-spot-1/2/3` | `1000×640` / `880×620` / `700×500`（px） | `.shell` 三层 radial 光斑的椭圆尺寸 |
| `--desk-solid-alpha` | `70%` | 材质开启时 `--desk-solid` 的保留不透明度 |
| `--selection-bg` | `brand 22%` + transparent | 全局 `::selection` 底色，随当前主题 `--brand` 变化 |

分组计数：排版 5、圆角 3、字体 3、动效 5、层级 3、光斑 3、材质 1、选区 1，共 **24** 条。层级令牌只维护相对序（悬停卡 < 浮窗 < 嵌套卡 < tooltip < 模态 1000+），使用处不写字面量 `z-index`；注释明确本组光斑仅 light / sage / honey 生效——dark 由 `shell.css` 的 `[data-theme='dark'] .shell` 整体替换为无光斑的斜切色带，**四主题块均不覆写** `--desk-spot-*`。

---

## 4. 四套主题令牌

### 4.1 分组与条数

四套主题按同一分组组织，但**条数并不相同**，不能从 light 机械推导：

| 分组 | light | dark | sage | honey | 说明 |
| --- | --- | --- | --- | --- | --- |
| 桌面 / 窗口表面 | 9 | 6 | 9 | 9 | dark 无 `--desk-glow-*` |
| 交互底色 | 2 | 2 | 2 | 2 | `--soft` / `--line` |
| 不透明交互底色 | 5 | 5 | 5 | 5 | `--*-solid` |
| 控件 on-soft | 3 | 3 | 3 | 3 | `--control-on-soft*` |
| 文本 | 3 | 3 | 3 | 3 | `--text*` |
| 品牌 / 语义 | 5 | 5 | 5 | 5 | `--brand*` / `--ok` / `--warn` / `--danger` |
| 正文 | 2 | 2 | 2 | 2 | `--doc-text` / `--caret` |
| 阴影 / 描边 | 5 | 5 | 3 | 3 | sage / honey 省略 `--sh-xs`、`--sh-sm` |
| 浮层遮罩 | 1 | 1 | 0 | 0 | sage / honey 继承亮色块 |
| 文本选区 | 0 | 1 | 0 | 1 | light / sage 用 `:root` 的 22% |
| 兼容层 | 2 | 2 | 2 | 2 | `--bg` / `--fg` |
| **合计** | **37** | **35** | **34** | **35** | — |

### 4.2 桌面与窗口表面

| 变量 | light | dark | sage | honey |
| --- | --- | --- | --- | --- |
| `--desk-1` | `#dfe4f2` | `#1c1c2b` | `#dbe9dc` | `#ece3cd` |
| `--desk-2` | `#eef0f6` | `#1c1c2b` | `#e9f1ea` | `#f5edd9` |
| `--desk-3` | `#e6e9f4` | `#19202b` | `#e0ebe2` | `#eee5d1` |
| `--desk-solid` | `#eef0f6` | `#161616` | `#e9f1ea` | `#f5edd9` |
| `--desk-glow-1/2/3` | 紫 / 蓝 / 白，α≈0.04 | **无** | 绿系，α≈0.03 | 金系，α≈0.03 |
| `--win-rgb` | `243, 243, 243` | `26, 26, 28` | `238, 245, 238` | `249, 243, 228` |
| `--pane` | `#ffffff` | `#202020` | `#fcfffc` | `#fffef9` |

- `.shell` 桌面底 = 三层 radial 光斑 + `linear-gradient(150deg, --desk-1, --desk-2 45%, --desk-3)`（`shell.css:30-34`）；dark 由 `[data-theme='dark'] .shell` 覆盖为 4 层不透明色带（`#1c1c2b` / `#161616` / `#19202b`），**这是全库唯一允许写主题色字面量的例外**。
- `--desk-solid` 在 light / sage / honey 恒等于各自 `--desk-2`，dark 单独定为 `#161616`。`--win-rgb` 仅被主进程用作 `BrowserWindow.backgroundColor` 参照（`window.ts:81-84`、`windowMaterial.ts:38-39` 写死 `#f3f3f3`）；`--pane` 是左右栏 / 面板 / 编辑区的不透明底（约 150 处，频次最高）。原先作为左右栏底色契约保留的 `--win-surface` 已无消费点，已于本次清理删除。

### 4.3 交互底色与控件底色

| 变量 | light | dark | sage | honey |
| --- | --- | --- | --- | --- |
| `--soft` | 黑 3.7% | 白 5% | `rgb(20,60,30)` 5% | `rgb(80,60,10)` 4.5% |
| `--line` | 黑 8% | 白 10% | `rgb(20,60,30)` 10% | `rgb(80,60,10)` 12% |
| `--soft-solid` | `--text` 6% 混 `--pane` | 5% | `rgb(20,60,30)` 6% | `rgb(80,60,10)` 6% |
| `--soft-hover-solid` | 6% | 8% | 8% | 7% |
| `--soft-press-solid` | 9% | 11% | 11% | 10% |
| `--pill-bg-solid` / `--pill-bg-hover-solid` | 5% / 8.5% | 7% / 12% | 7% / 11% | 6% / 10% |
| `--control-on-soft` / `-hover` | 10% / 14% | 14% / 19% | 10% / 14% | 10% / 14% |
| `--control-on-soft-line` | 37% | 22% | 37% | 37% |

- 半透明组中**只有 `--soft` 仍有消费点**（`writer-ai.css` 3 处）；`--soft-hover`、`--soft-press`、`--pill-bg`、`--pill-bg-hover` 早已被 `-solid` 取代、无任何消费点，已于本次清理从四主题块删除，新代码不要使用。light / sage / honey 的 `--soft-solid` **刻意加深到 6%**（左栏分区容器卡口径，全库共享），故 light 的 `--soft-solid` 与 `--soft-hover-solid` 同值，这是有意为之。
- 混色分两派：light / dark 用 `var(--text)`（dark 下白字混入 = 提亮）；sage / honey 固定用本主题基色 `rgb(20,60,30)` / `rgb(80,60,10)` 以保住绿调 / 暖黄调，改用 `--text` 会掉色相。
- **控件 on-soft 的方向相反**：light 下 `--text` 为深色，10% 混入使控件**更深**；dark 下为白色，14% 混入使控件**更亮**。统一取向是「控件底接近卡片底，边界靠 `--control-on-soft-line`」：浅色系约 1.07–1.09:1 + 37% 描边（对控件底 1.9–2.25:1），dark 约 1.34:1 + 22% 白描边。微调只需改这三行比例，且四套主题各自显式定义，不依赖 `:root` 继承。

### 4.4 文本、品牌、正文与兼容层

| 变量 | light | dark | sage | honey |
| --- | --- | --- | --- | --- |
| `--text` / `--text-dim` / `--text-mute` | `#1a1a1a` / `#5c5c5c` / `#8a8a8a` | `#fff` / `#c8c8c8` / `#909090` | `#1a2a1e` / `#4e6254` / `#7e8f83` | `#2b2415` / `#6a5c3c` / `#96886c` |
| `--brand` / `--brand-2`（静态） | `#5b4de8` / `#2f9ae0` | `#8b7ff0` / `#5fc0ec` | `#4a9d5f` / `#6cbf88` | `#c99426` / `#e0b85e` |
| `--ok` / `--warn` / `--danger` | `#0f7b4f` / `#9d5d00` / `#c42b1c` | `#4ccfa4` / `#f2b357` / `#e05252` | `#4a9d5f` / `#b88a1e` / `#c34a3a` | `#6b9d3a` / `#b88a1e` / `#c34a3a` |
| `--doc-text` | `#252b3b` | `#d8d8dc` | `#1f3225` | `#332a17` |
| `--caret` | `brand 55% + doc-text 45%` | `var(--brand)` | `var(--brand)` | `var(--brand)` |
| `--bg` / `--fg` | `#f7f7f8` / `#1f2328` | `#1a1c26` / `#ffffff` | `#dbe9dc` / `#1a2a1e` | `#ece3cd` / `#2b2415` |

- **`--brand` / `--brand-2` 的静态值只是回退**：light / dark 下会被系统强调色内联覆盖（§6），sage / honey 始终使用静态值。
- light 的 `--caret` 由品牌色向正文色暗化，避免浅底上过亮；其余三套直接取 `--brand`。
- **兼容层** `--bg` / `--fg` 为历史令牌：仅 `global.css:8-12` 的 `body` 使用（材质态下 `body` 底被置透明）。新代码不得引用；同组的 `--accent` / `--border` 已无消费点，已于本次清理删除。

### 4.5 阴影、遮罩与选区

| 变量 | light | dark | sage / honey |
| --- | --- | --- | --- |
| `--sh-xs` / `--sh-sm` | 黑 5% / 6% + 4.5% | 黑 30% / 30% + 25% | 继承 light |
| `--sh-popup` | 黑 10% / 12% | 黑 40% / 50% | 本主题基色 10% / 12% |
| `--sh-float` | 黑 22% | 黑 60% | 本主题基色 22% |
| `--panel-ring` | 1px 黑 5% | 1px 白 6% | 本主题基色 6% |
| `--overlay-mask` | `rgba(0,0,0,.32)` | 同值 | 继承（0.32） |
| `--selection-bg` | `:root` 的 22% | 30% | sage 22% / honey 28% |

- `--panel-ring` 是面板描边的实际主力（20+ 处），常与 `--sh-*` 组合为 `box-shadow: var(--sh-sm), var(--panel-ring)`；窗口外阴影由系统承担，原先作为窗口卡片契约保留的 `--win-shadow` 无消费点，已于本次清理删除。遮罩浓度四主题统一 32%，**不随明暗变化**；组件一律引用 `--overlay-mask`。选区按底色明度单独调过：dark 22% 会糊进 `#202020` 故 30%，honey 品牌金与米色底明度接近故 28%，sage 沿用 22%。

### 4.6 light / dark 差异清单（不可互相推导）

1. **桌面结构**：light 是「光斑 + 斜向渐变」，dark 是硬编码四层色带（无光斑、无 `--desk-glow-*`）。
2. **交互底色方向**：light 用黑 α 压暗，dark 用白 α 提亮（`--soft` 3.7% → 5%，`--line` 8% → 10%）。
3. **`--soft-solid` 基数**：light 6/6/9/5/8.5%，dark 5/8/11/7/12%（dark 无「容器卡加深到 6%」偏移）；控件 on-soft 亦相反（light 10/14/37，dark 14/19/22）。
4. **阴影与描边**：light `--sh-xs` 5%、`--sh-float` 22%；dark 30% / 60%，`--panel-ring` 由黑环变白环。
5. **光标与选区**：`--caret` light 混 `--doc-text`、dark 直接 `--brand`；选区 22% vs 30%；条数 37 vs 35（dark 少 3 条光斑、多 1 条选区）。

---

## 5. 不透明令牌与材质协同

`--*-solid` 组（light 100-104、dark 182-186、sage 253-257、honey 315-319）是组件自身填充专用：**alpha 恒为 1**，用 `color-mix` 把原半透明档的比例混入不透明 `--pane`。

| 令牌 | 语义 | 典型消费 |
| --- | --- | --- |
| `--soft-solid` | 卡片 / 分区容器 / 次级按钮底 | 56 处（`surface.css`、`bookshelf.css`、`form.css`…） |
| `--soft-hover-solid` | 上述元素 hover | 标题栏按钮、书卡、状态栏 |
| `--soft-press-solid` | 按下态 | 标题栏按钮 |
| `--pill-bg-solid` / `--pill-bg-hover-solid` | 胶囊底 / hover | `statusbar-widgets.css` |

材质（Acrylic）链路：

1. `WindowMaterialProvider` 在 `<html>` 写 `data-material='acrylic' | 'none'`。
2. 开启时 `acrylic.css:24-26` 把 `.shell` 底色换为 `color-mix(in srgb, var(--desk-solid) var(--desk-solid-alpha), transparent)`，即各主题纯色底保留 **70%** 不透明度；同时 `body` 背景置透明（`acrylic.css:30-32`），否则 `body` 的 `--bg` 会挡住 DWM 材质。
3. 面板 / 侧栏 / 编辑区继续用不透明 `--pane`，**只有组件缝隙**透出材质。这正是 `-solid` 组存在的理由：若沿半透明 `--soft`，材质会从每张卡内部透出，文字对比度随壁纸漂移。
4. `--desk-solid-alpha` 是主题无关的单一旋钮（70%），四主题共用；dark 的 `--desk-solid` 取 `#161616`（与色带中段同值），避免深色下材质偏亮。主进程窗口底：材质开 `#00000000`，关 `#f3f3f3`（= light 的 `--win-rgb`），避免创建瞬间黑闪（`window.ts:81-84`）。

选择顺序：**`--soft-solid` 容器上的输入类控件用 `--control-on-soft*`；普通卡片 / 按钮用 `--*-solid`；只有确需透出下层的浮层才用半透明档**。

---

## 6. 系统强调色

只有 **light / dark** 消费系统强调色；`system` 解析后落在这两档，因此也间接受影响。**sage / honey 一律使用 `theme.css` 的静态品牌色**（`useSystemAccent.ts:12-14`）。

1. 主进程 `getAccentColor()`（`main/theme.ts:56-64`）读 `systemPreferences.getAccentColor()`，`normalizeAccent()` 归一为 `#rrggbb`（`main/theme.ts:27-48`）。Electron 44 / Windows 返回**无 `#` 的 8 位 RRGGBBAA**（如 `0078D4FF`），归一化丢弃 alpha。
2. 读取失败 / 值非法返回 `null`，**不设固定兜底色**，渲染层据此回退主题静态色。
3. 渲染层经 `window.api.systemTheme.getAccentColor()` 首取，并 `onAccentChange()` 订阅（`preload/index.ts:362-366`）。
4. `setupThemeWatchers()`（`main/theme.ts:78-90`）监听 `nativeTheme.on('updated')`——系统明暗、高对比、强调色改动通常伴随该事件——向所有窗口发 `theme:accent:changed`（通道常量 `ACCENT_CHANGED_CHANNEL`，`main/theme.ts:18`）；IPC 在 `main/ipc/theme.ts` 注册。
5. `useSystemAccent()` 用 `useLayoutEffect` 写 `<html>` 内联样式：`--brand` = 强调色，`--brand-2` = `deriveBrand2(强调色)`（`color.ts:72-77`：深色向白混 32%、亮色向黑混 28%）；非 light/dark 或强调色为空时 `removeProperty` 清除覆盖。

- 覆盖在内联样式上，**`--brand` 的实际值随系统变化**；文档里的 `#5b4de8`、`#8b7ff0` 只能当回退值。订阅常驻、不随主题重建：从 sage / honey 切回 light / dark 会立即用缓存的强调色重新覆盖。
- 必须用 `useLayoutEffect`：View Transition 拍快照时，内联覆盖要与 `data-theme` 在同一次 commit 落地，否则新快照会先拍到静态品牌色再硬跳。
- 主题面板缩略图（`theme-switcher.css:152-198`）用**静态** `--brand`，因此 light / dark 缩略图高亮色与运行时可能不同，属预期；`--selection-bg` 由 `--brand` 派生，强调色变化会同步改变选区色。

---

## 7. 主题切换与 View Transition

### 7.1 主动切换

`ThemeProvider.setTheme()`（`ThemeProvider.tsx:71-99`）：

```
next === theme                  → 直接返回（不重复过渡）
resolved === 当前 dataset.theme → flushSync 只提交状态，不启动过渡
否则                            → runThemeReveal(() => {
                                    dataset.theme = resolved
                                    flushSync(() => setThemeState(next))
                                  })
```

- 第二分支处理「当前是 `system` 且系统为暗，用户改选 `dark`」：`data-theme` 前后都为 `dark`，两张快照一致，过渡会空转成「没反应」，故只更新选中态。持久化 effect（`ThemeProvider.tsx:66-69`）保存用户选择（可为 `system`），`window.api` 缺失时静默跳过。

### 7.2 被动切换

`resolvedTheme` 变化 → `useEffect` 直接写 `dataset.theme`（`ThemeProvider.tsx:55-61`），**不经** `runThemeReveal`：用户没有主动操作，整屏动画反而突兀。这是有意设计。

### 7.3 过渡实现

`runThemeReveal()`（`themeReveal.ts:94-170`）用 `document.startViewTransition` 拍整窗快照，再用 WAAPI 驱动伪元素：

- 时长 / 缓动读 `--dur-slow`（240ms）与 `--ease`（对称曲线），读失败回退常量，不写裸时长；改由 JS 而非 CSS 是因为 CSS 曾用强前倾曲线 + 180ms，前 3 帧走完 3/4，肉眼等同瞬切。
- `motion.css` 只做三件事：`::view-transition-old/new(root)` 一律 `animation: none`；`::view-transition-new(root)` 基础 `opacity: 0`（`ready` 前物理上不可能闪）；acrylic 下两层改 `mix-blend-mode: plus-lighter`。
- 不透明材质：**覆盖式**。旧快照保持不透明垫底，新快照 0 → 1 淡入；真交叉会让亮暗两层同时半透明而整屏泛灰。
- Acrylic：**真交叉 + `plus-lighter`**，old 1 → 0 与 new 0 → 1 同步，预乘后合计恒为 0.70，材质透出率全程 30% 不变。old 必须 `fill: 'forwards'`，否则结束回落 opacity 1 会与 new 相加导致一帧变实。
- 降级（直接 `applyTheme()`，切换永不依赖动画）：不支持 `startViewTransition`、`prefers-reduced-motion: reduce`、启动抛错、`ready` 被跳过（窗口隐藏 / 快速连切）。最后一种在 catch 中补调一次，并用 `revealSequence` 序号守卫，避免旧切换回写已被取代的主题。

---

## 8. 样式导入顺序与层叠契约

`styles/index.css`（13-24）的顺序有语义，不得随意调整：

| 顺序 | 文件 | 为什么必须在此位置 |
| --- | --- | --- |
| 1 | `fonts.css` | `@font-face` 先就位，避免首帧字体回退 |
| 2 | `theme.css` | **所有令牌定义必须先于消费者**，且 `:root` / 亮色块早于各主题块 |
| 3 | `entity-highlight-tokens.css` / `chip-pill-tokens.css` | 实体高亮令牌与胶囊模块色系；胶囊默认基色 `--chip-base` 依赖前者，不再隐式依赖写作域加载链 |
| 4 | `base.css` | 重置、`body` 字体、`::selection`、滚动条、减动效兜底 |
| 5 | `components/motion.css` | 工具类为单类选择器且当前无挂载点，放业务样式前，任何业务规则都能「后加载者胜」 |
| 6 | `global.css` | 既有布局 / 组件样式 |
| 7 | `chip-pill.css` | 胶囊基类，就地派生 `--chip-fg` |
| 8 | `chip-preset-colors.css` | **必须最后**：`.chip-p-*` 与 `.chip-m-*` 同为 0,1,0，只有后加载才能覆盖模块基色；其配对文字色也必须压过 `chip-pill.css` 的派生色，否则首帧「实色底 + 低对比字」闪烁 |

`App.tsx:22-23` 另有顺序依赖：`shell.css` 定义 `.shell` 基础底与 `[data-theme='dark'] .shell`（0,2,0），`acrylic.css` 随后导入，`[data-material='acrylic'] .shell` 同为 0,2,0，**只能靠源码顺序胜出**；提前加载会被 dark 色带盖掉。

契约：① 令牌块永远在消费者之前，页面 CSS 不得重声明 `:root` 令牌；② 同特异性冲突靠「后加载者胜」，不用 `!important`；③ 需要让位时用 `:where()` 把特异性压到 0；④ 新增样式文件先判断属于「令牌 → 基础 → 组件 → 预设覆盖」哪一层再插入。

---

## 9. 使用规约

1. **禁止硬编码颜色**。颜色、`box-shadow` 的 rgba、`::selection`、遮罩、渐变一律取令牌。唯一例外是 `shell.css:67-83` 的 dark 色带（渐变色标无法由令牌组合），新增例外须在注释登记理由。
2. **不得给主题令牌挂 `transition`**。`--dur-*` 只服务交互（hover / 展开 / 拖拽 / 显隐）与进出场；仅由 `data-theme` 引起的 `color` / `background` / `box-shadow` 过渡一律删除。主题整体由 View Transition 淡化，CSS 再过渡会出现「一部分渐变、一部分硬跳」。
3. **新增令牌必须四套主题齐全**。主题相关令牌在 light / dark / sage / honey 四块**各自显式声明**（尤其 `--control-on-soft*`，注释明确要求不依赖 `:root` 继承）；主题无关才放 `:root`。只加一侧会让某主题悄悄沿用亮色值。
4. **不得跨主题推导**。dark 的 `--desk-2/3`、`--pane`、阴影、选区透明度与 light 语义不同（§4.6），复制 light 比例再调亮度必然出错。
5. **不透明优先**：组件填充用 `--*-solid`，否则 Acrylic 下材质从组件内部透出。
6. **字号 / 行高 / 缩放走 `--doc-*`**，时长走 `--dur-*`，缓动走 `--ease` / `--ease-out`，层级走 `--z-*`；禁止裸 `0.2s`、`ease-in-out`、字面量 `z-index`。
7. **语义色不改语义**：`--ok` / `--warn` / `--danger` 只表达状态，不当品牌强调；`--brand` 会被系统强调色覆盖，不要当固定色画插画。
8. **兼容层令牌禁止新增使用**（`--bg` / `--fg`；同组原 `--accent` / `--border` 已随本次清理删除）。
9. 改令牌后核对四套主题的正文 / 次要文字 / 控件描边 / 选区对比度，并在 Acrylic 开、关两种状态下各看一遍；若涉及主题或外观描述，同步教学书种子（`seedGuideBook/`）。

最后核对：2026-11-01
