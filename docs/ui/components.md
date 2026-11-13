# 通用 UI 组件库

> 本文档描述 `src/renderer/src/components/ui/` 下的 **23 项**通用 UI（21 个组件 + 2 个钩子），
> 是渲染层组件选型与用法的一手参考。所有 props 类型、默认值、类名均来自源码与本目录 CSS，
> 不包含 `components/editor/` 等业务域组件。
>
> 本页已于 2026-11-09 按 `index.ts` 与目录清单校正：删除已不存在的 8 个组件详解，
> 补入 `EntityStyleCard` / `Splitter`；目录另有 `useSplitter.ts`（Splitter 内部 hook，不进 barrel）。

**适用范围**：所有渲染层页面 / 组件（`pages/`、`shell/`、`diagnostics/` 等）。

**阅读方式**：

- 先看 [§1 组件库约定](#1-组件库约定) 了解导入方式、导出差异与样式加载规则；
- 用 [§2 总览表](#2-总览表) 按需求选型；
- 再到 [§3 逐个组件详解](#3-逐个组件详解) 查 props、类名、键盘行为与示例；
- Toast / Tooltip 是钩子形态，见 [§4](#4-钩子形态toast-与-tooltip)；
- 新增组件前必须过一遍 [§5 通用化检查表](#5-新增组件的通用化检查表)。

---

## 1. 组件库约定

### 1.1 目录与文件构成

```
src/renderer/src/components/ui/
  index.ts                 # barrel 聚合出口（只转发具名导出）
  Badge.tsx  Button.tsx  Card.tsx  ChipInput.tsx  ColorSwatchPicker.tsx
  Combobox.tsx  Dropdown.tsx  EntityStyleCard.tsx  FormField.tsx  IconButton.tsx
  Input.tsx  Modal.tsx  Progress.tsx  SearchInput.tsx  Segmented.tsx  Select.tsx
  Splitter.tsx  Switch.tsx  Tag.tsx  Textarea.tsx  Toast.tsx  Tooltip.tsx
  Window.tsx  useSplitter.ts
```

- 目录内共 **25 个文件**：23 个实现模块 + `index.ts` + `useSplitter.ts`。
- 23 个实现模块对应 **23 项导出**：21 个组件 + 2 个钩子（`useToast` / `useTooltip`）。
- `useSplitter.ts` 是 `Splitter` 的内部拖拽 hook，不由 barrel 转发，不计入 23 项。
- 一个文件即一个组件（或钩子），不把多个组件堆进同一文件。

### 1.2 barrel 导出（`index.ts`）

`index.ts` 用 `export *` 逐个转发实现模块的**具名导出**（组件 + 其 props 类型）：

```ts
export * from './Badge'
// … 共 23 行
```

因此推荐的统一导入方式是**从桶文件按需取具名导出**：

```tsx
import { Button, Card, IconButton } from '../../components/ui'
import type { DropdownItem } from '../../components/ui'
```

需要同时取类型时，值导入与类型导入分两行（`verbatimModuleSyntax` 口径）。

> **桶文件注释口径**：`index.ts` 顶部写「已核对 23 个组件的 props 类型名互不冲突」，
> 数字 23 与实际模块数一致；严格分类为 21 个组件 + 2 个钩子。本页按 23 项口径计数。
> `useSplitter` 不在桶文件中，需要时从 `./useSplitter` 直接引入。

`export *` 的副作用与边界：

- 同名具名导出会冲突（当前无冲突）。新增组件时若 props 类型重名（如两个 `Size`），
  必须改名（`XxxSize`）或改为模块内非导出类型，否则整个桶文件编译失败。
- 默认导出**不会**被转发，需要通过具体文件路径引入。

### 1.3 默认导出与具名导出的差异（重要）

23 项中 **18 项有 `export default`，5 项只有具名导出**：

| 无默认导出（只能具名引入） | 文件           |
| -------------------------- | -------------- |
| `Input`                    | `Input.tsx`    |
| `Textarea`                 | `Textarea.tsx` |
| `Select`                   | `Select.tsx`   |
| `Switch`                   | `Switch.tsx`   |
| `Combobox`                 | `Combobox.tsx` |

对这 5 个写 `import Input from './Input'` 会直接报错（模块无默认导出）。

**统一规则：一律用具名导入。** 具名导入对 23 项全部有效，且与桶文件一致，不必记忆差异：

```tsx
import { Input, Select } from '@renderer/components/ui' // ✅ 全部可用
import Input from './Input' // ❌ Input 无默认导出
```

其余 18 项的默认导出仅为兼容历史调用点存在，新代码不再使用。

> 两个钩子文件也带默认导出（`Toast.tsx` 默认导出 `useToast`、`Tooltip.tsx` 默认导出
> `useTooltip`），但它们属于上述 18 项之内，同样不推荐默认导入。

### 1.4 样式自动引入

**调用方不需要 import 任何 CSS。** 大多数实现文件在顶部自行引入所需样式表；`EntityStyleCard` / `Splitter` 是例外——前者由 `styles/index.css` 全局引入 `entity-card.css`，后者由 `pages/Writer.tsx` 引入 `styles/writer.css`。

```ts
import '../../styles/components/button.css'
```

共享样式表的情况（多个组件共用一个 CSS，重复 import 会被打包器去重）：

| 样式文件             | 行数 | 服务的组件                                                                                                                  |
| -------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `button.css`         | 183  | Button                                                                                                                      |
| `icon-button.css`    | 82   | IconButton                                                                                                                  |
| `surface.css`        | 379  | Card / Tag / Badge / Progress（首行 `@import './modal.css'`；另含已移除 Avatar / Divider 的残留规则）                       |
| `modal.css`          | 86   | Modal（经 `surface.css` 转发引入）                                                                                          |
| `overlay.css`        | 256  | Dropdown（另含已移除 Drawer 的残留规则）                                                                                    |
| `form.css`           | 408  | Input / Textarea / Switch / Select / Combobox（首行 `@import './form-select.css'`；另含已移除 Checkbox / Radio 的残留规则） |
| `form-select.css`    | 180  | Select / Combobox（经 `form.css` 转发引入）                                                                                 |
| `form-extras.css`    | 370  | SearchInput / ChipInput / FormField                                                                                         |
| `display-extras.css` | 223  | ColorSwatchPicker（另含已移除 Accordion 的残留规则）                                                                        |
| `segmented.css`      | 105  | Segmented                                                                                                                   |
| `toast.css`          | 52   | useToast                                                                                                                    |
| `tooltip.css`        | 93   | useTooltip                                                                                                                  |
| `window.css`         | 114  | Window（Modal 面板复用其结构）                                                                                              |
| `entity-card.css`    | 129  | EntityStyleCard（由 `styles/index.css` 全局引入，组件自身不 import）                                                        |

`styles/components/` 目录共 **27 个 CSS**（含 `category-manager.css`、`editor-format.css` 等业务域样式，
不由 `components/ui/` 引入），合计约 3,946 行。`Splitter` 的样式在 `styles/writer.css`（由
`pages/Writer.tsx:34` 引入），不在 `components/`；在写作页之外复用时需先把样式迁到组件层。

层叠顺序由「谁先 import」决定：`surface.css` 主动 `@import './modal.css'`、`form.css` 主动
`@import './form-select.css'`，是为了让被拆出的样式仍保持原有的先后次序（同特异性覆盖规则依赖于此）。
**不要在组件里手写覆盖样式**，需要变体时走 props 或 `className` 追加修饰类。

### 1.5 `@renderer` 路径别名

`@renderer` 指向 `src/renderer/src`，两端各配一处：

- 构建：`electron.vite.config.ts` → `resolve.alias` 中的 `'@renderer': resolve('src/renderer/src')`
- 类型：`tsconfig.web.json` → `paths` 中的 `"@renderer/*": ["src/renderer/src/*"]`

```tsx
import { Button } from '@renderer/components/ui'
```

现状：页面层大量使用相对路径（`'../../components/ui'`），`lib/` 等深层模块多用别名。
两种写法都合法；**同一个文件内保持一种风格**，跨层引用（`pages/` → `components/`）优先相对路径，
避免给叶子模块引入构建期别名依赖。

### 1.6 `wf-` 类名体系

所有类名统一 `wf-` 前缀，命名遵循 BEM + 状态类：

| 形态                 | 含义               | 示例                                                                   |
| -------------------- | ------------------ | ---------------------------------------------------------------------- |
| `wf-block`           | 根节点             | `.wf-btn`、`.wf-card`、`.wf-select`                                    |
| `wf-block__element`  | 内部元素           | `.wf-card__body`、`.wf-select__option`                                 |
| `wf-block--modifier` | 变体（props 映射） | `.wf-btn--primary`、`.wf-card--halo`                                   |
| `is-state`           | 运行期状态         | `.is-active`、`.is-open`、`.is-disabled`、`.is-invalid`、`.is-closing` |

约定：

- 变体类由 props 计算得出（`variant` → `wf-btn--primary`），调用方不需要手写；
- 状态类只由组件内部根据状态追加；
- `className` 一律合并到**根节点**（`SearchInput` 例外，见 3.13；`Card` / `Window` 另有
  `bodyClassName` 作用于内容容器）；
- 颜色只取 `styles/theme.css` 令牌或 `color-mix` 派生，四主题（light / dark / sage / honey）通用，
  **禁止在组件里硬编码品牌色**；
- 业务域的额外类（如 `.wf-card--halo`、`.wf-seg--fill`）由调用方通过 `className` 追加，
  组件库本身不暴露对应 prop。

### 1.7 交互与无障碍红线

1. **卡片类禁止「弹起」动画**（`AGENTS.md` §8）：hover 只允许颜色 / 描边 / 阴影变化，
   不得出现 `transform: translate / scale / rotate`。`Card`、`ColorSwatchPicker`、`Segmented`
   等均已遵守。
2. **浮层一律 `createPortal` 到 `document.body`**：Modal、Dropdown 之外的
   Select / Combobox 面板、Tooltip、Toast 都走 portal + 固定定位，以逃逸 `overflow` 裁剪。
3. **层序固定**：Tooltip `990` < Modal `1000` < Select / Combobox 面板 `1040` < Toast `1100`。
   新增浮层请落在既有档位内，不要抢占更高层级。
4. **文案全部走 `t()`**（`AGENTS.md` §10）：组件内置文案（关闭 / 移除 / 清除 / 暂无选项 / 占位符等）
   已接入 `common` 命名空间（`close`、`remove`、`clear`、`noOptions`、`selectPlaceholder`、
   `chipPlaceholder`、`removeTag`）；`stepper*` 键为已移除 Stepper 的历史遗留，待清理。
   调用方传入的文案同样必须走 `t()`。
5. **禁用优先用原生 `disabled`**：除 Card / Window 这类纯容器外，交互组件的禁用态都映射到原生属性，
   键盘与读屏行为由浏览器保证。

---

## 2. 总览表

| 组件 / 钩子       | 导入名              | 一句话用途                                | 默认导出           |
| ----------------- | ------------------- | ----------------------------------------- | ------------------ |
| Badge             | `Badge`             | 状态标签 / 计数徽标                       | ✅                 |
| Button            | `Button`            | 通用按钮（4 变体 3 尺寸，支持 loading）   | ✅                 |
| Card              | `Card`              | 面板容器，含标题区 / 页脚                 | ✅                 |
| ChipInput         | `ChipInput`         | 受控标签输入（回车 / 逗号新增）           | ✅                 |
| ColorSwatchPicker | `ColorSwatchPicker` | 色板选择（radiogroup 语义）               | ✅                 |
| Combobox          | `Combobox`          | 可搜索下拉组合框                          | ❌ 仅具名          |
| Dropdown          | `Dropdown`          | 下拉菜单（含分隔线 / 勾选项）             | ✅                 |
| FormField         | `FormField`         | 字段容器：label / hint / error / required | ✅                 |
| IconButton        | `IconButton`        | 圆形图标按钮（自带 tooltip）              | ✅                 |
| Input             | `Input`             | 单行文本输入                              | ❌ 仅具名          |
| Modal             | `Modal`             | 模态弹窗（焦点陷阱 / 嵌套栈）             | ✅                 |
| Progress          | `Progress`          | 进度条                                    | ✅                 |
| SearchInput       | `SearchInput`       | 搜索框（前置图标 + 清除按钮）             | ✅                 |
| Segmented         | `Segmented<T>`      | 分段控件 / 标签切换                       | ✅                 |
| Select            | `Select`            | 下拉选择（自绘面板）                      | ❌ 仅具名          |
| Switch            | `Switch`            | 开关（`role="switch"`）                   | ❌ 仅具名          |
| Tag               | `Tag`               | 标签，可关闭 / 可带操作                   | ✅                 |
| Textarea          | `Textarea`          | 多行文本输入                              | ❌ 仅具名          |
| Toast             | `useToast`          | 命令式轻提示（钩子）                      | ✅（默认导出钩子） |
| Tooltip           | `useTooltip`        | 自绘 tooltip（钩子）                      | ✅（默认导出钩子） |
| Window            | `Window`            | 窗口框架：标题 / 内容 / 底部操作区        | ✅                 |
| EntityStyleCard   | `EntityStyleCard`   | 实体样式卡壳（剧情 / 伏笔 / 设定共用）    | ✅                 |
| Splitter          | `Splitter`          | 分栏拖拽分隔条（8px，键盘可达）           | ✅                 |

统计口径：**23 项 = 21 个组件 + 2 个钩子**；有默认导出 **18 项**，**无默认导出 5 项**
（Combobox / Input / Select / Switch / Textarea）。`useSplitter` 是 `Splitter` 的内部 hook，不计入本表。

---

## 3. 逐个组件详解

每节结构固定：**用途** → **Props**（名称 / 类型 / 默认值 / 说明，均取自源码）→ **关键类名** →
**键盘与无障碍** → **示例**。类型里用 `/` 分隔字面量联合（如 `'sm' / 'md' / 'lg'`）。

### 3.1 Badge

**用途**：状态标签（`dot` + 文案）或计数徽标（`count`）。`count` 优先于 `children`，
超过 `max` 显示 `${max}+`。常用于书籍卡状态、未读计数。

**Props**（继承 `HTMLAttributes<HTMLSpanElement>`）

| 名称       | 类型                                             | 默认值      | 说明                               |
| ---------- | ------------------------------------------------ | ----------- | ---------------------------------- |
| `tone`     | `'neutral' / 'brand' / 'ok' / 'warn' / 'danger'` | `'neutral'` | 色调                               |
| `dot`      | `boolean`                                        | `false`     | 文案前显示状态点                   |
| `count`    | `number`                                         | `undefined` | 计数；提供后优先于 `children` 渲染 |
| `max`      | `number`                                         | `99`        | 计数上限，超出显示 `99+`           |
| `children` | `ReactNode`                                      | `undefined` | 自定义文案                         |

**关键类名**：`.wf-badge`、`.wf-badge--neutral/brand/ok/warn/danger`、`.wf-badge__dot`
（`aria-hidden`）、`.wf-badge__text`。

**键盘与无障碍**：静态展示，无 role、不可聚焦。状态点已 `aria-hidden`，语义完全由文本承担；
计数被截断为 `99+` 时，建议在容器上补 `aria-label` 或 `title` 给出完整数值。

**示例**

```tsx
<Badge tone="ok" dot>{t('status.draft')}</Badge>
<Badge tone="danger" count={128} max={99} />
```

### 3.2 Button

**用途**：通用按钮。透传原生 `<button>` 属性并支持 `ref` 转发；`loading` 时展示指示器、
置为禁用并标 `aria-busy`。

**Props**（继承 `ButtonHTMLAttributes<HTMLButtonElement>`）

| 名称       | 类型                                           | 默认值        | 说明                                        |
| ---------- | ---------------------------------------------- | ------------- | ------------------------------------------- |
| `variant`  | `'primary' / 'secondary' / 'ghost' / 'danger'` | `'secondary'` | 视觉变体                                    |
| `size`     | `'sm' / 'md' / 'lg'`                           | `'md'`        | 尺寸；`md` 不额外输出尺寸类（高 36px）      |
| `iconOnly` | `boolean`                                      | `false`       | 方形图标按钮（内容为单个图标）              |
| `loading`  | `boolean`                                      | `false`       | 加载中：显示 spinner、禁用交互、`aria-busy` |
| `disabled` | `boolean`                                      | `undefined`   | 原生禁用；与 `loading` 取或                 |
| `type`     | `'button' / 'submit' / 'reset'`                | `'button'`    | 显式默认 `button`，避免表单误提交           |

**关键类名**：`.wf-btn`、`.wf-btn--primary/secondary/ghost/danger`、`.wf-btn--sm/lg`、
`.wf-btn--icon`、`.is-loading`、`.wf-btn__spinner`、`.wf-btn__content`（loading 时降透明度）。

**键盘与无障碍**：原生按钮，Enter / Space 触发（`disabled` 时不可聚焦）。
`iconOnly` 只是视觉修饰，**不提供可访问名称**——必须同时传 `aria-label`；
`loading` 期间按钮被禁用，读屏依赖 `aria-busy` 判断忙碌态，文案建议改为「提交中…」。

**示例**

```tsx
<Button variant="primary" onClick={save} loading={saving}>
  {saving ? t('action.saving') : t('action.save')}
</Button>
<Button variant="ghost" iconOnly aria-label={t('action.more')}><MoreIcon /></Button>
```

### 3.3 Card

**用途**：面板容器，可选标题区（`title` / `subtitle` / `extra`）与页脚（`footer`）。
`soft` 变体为更轻的柔和底，`interactive` 为可点击卡片增加 hover 光晕。

**Props**（继承 `Omit<HTMLAttributes<HTMLDivElement>, 'title'>`）

| 名称            | 类型                 | 默认值      | 说明                                           |
| --------------- | -------------------- | ----------- | ---------------------------------------------- |
| `title`         | `ReactNode`          | `undefined` | 卡片标题，提供后渲染头部                       |
| `subtitle`      | `ReactNode`          | `undefined` | 标题下方副标题                                 |
| `extra`         | `ReactNode`          | `undefined` | 头部右侧附加内容（按钮 / 标签）                |
| `footer`        | `ReactNode`          | `undefined` | 页脚内容，带顶部细分隔线                       |
| `variant`       | `'default' / 'soft'` | `'default'` | 面板底 / 柔和底（无阴影）                      |
| `interactive`   | `boolean`            | `false`     | 可点击卡片：`cursor: pointer` + hover 边缘光晕 |
| `bodyClassName` | `string`             | `undefined` | 透传到内容容器                                 |
| `className`     | `string`             | `undefined` | 合并到根节点                                   |

**关键类名**：`.wf-card`、`.wf-card--soft`、`.wf-card--interactive`、`.wf-card--halo`
（外部追加的光晕变体）、`.wf-card__head/__titles/__title/__subtitle/__extra/__body/__footer`。

**键盘与无障碍**：纯布局容器，无 role、不可聚焦。`interactive` **只加样式**，不提供 `tabIndex`、
`role` 或键盘处理——可点击卡片必须把点击语义交给内部控件（如内部 `Button`），
或由调用方补 `role="button"` + `tabIndex={0}` + Enter/Space 处理。
另注意 CSS 给出 `min-height: 120px; max-height: 240px`，内容超长时自行在 `bodyClassName` 指定
滚动或改用 `Window` / 自定义容器。

**示例**

```tsx
<Card
  title={t('stats.title')}
  subtitle={t('stats.subtitle')}
  extra={
    <Button variant="ghost" size="sm">
      {t('action.refresh')}
    </Button>
  }
  footer={<span>{t('stats.updatedAt', { time })}</span>}
  variant="soft"
>
  <Progress value={62} />
</Card>
```

### 3.4 ChipInput

**用途**：受控标签输入。回车 / 逗号提交当前草稿，`Backspace` 在空输入时删除最后一项，
粘贴含换行或逗号的文本会批量拆分；重复标签自动忽略，达到 `max` 后不再新增。

**Props**

| 名称          | 类型                        | 默认值                        | 说明                                          |
| ------------- | --------------------------- | ----------------------------- | --------------------------------------------- |
| `value`       | `string[]`                  | 必填                          | 当前标签（受控）                              |
| `onChange`    | `(value: string[]) => void` | 必填                          | 标签变化回调                                  |
| `placeholder` | `string`                    | `t('common.chipPlaceholder')` | 占位文案；仅在无标签时显示                    |
| `max`         | `number`                    | `undefined`                   | 标签数量上限                                  |
| `disabled`    | `boolean`                   | `false`                       | 禁用整个控件                                  |
| `invalid`     | `boolean`                   | `false`                       | 错误态：附加 `is-invalid`                     |
| `id`          | `string`                    | `undefined`                   | 输入框 id，便于 `FormField` 的 `htmlFor` 关联 |
| `ariaLabel`   | `string`                    | `undefined`                   | 无可见标签时的无障碍名称                      |
| `className`   | `string`                    | `undefined`                   | 合并到根节点                                  |

**关键类名**：`.wf-chipinput`、`.wf-chipinput.is-disabled`、`.wf-chipinput.is-invalid`、
`.wf-chipinput__field`（点击空白聚焦输入框）、`.wf-chipinput__chip`（复用 `chip-pill chip-pill--neutral`）、
`.wf-chipinput__chip-close`、`.wf-chipinput__entry`。

**键盘与无障碍**：Enter / `,` 提交（阻止默认）；空输入时 Backspace 删末项；输入框本身是普通
`<input type="text">`，Tab 可达。每个 chip 的删除按钮是 `<button>`，`aria-label` 为
`t('common.removeTag', { tag })`，Tab 可逐个聚焦。禁用时 `<input>` 与删除按钮同时 `disabled`。

**示例**

```tsx
<FormField label={t('book.tags')} htmlFor="book-tags" hint={t('book.tagsHint')}>
  <ChipInput id="book-tags" value={tags} onChange={setTags} max={8} />
</FormField>
```

### 3.5 ColorSwatchPicker

**用途**：色板选择。选项可传纯色字符串或 `{ value, css, ring }` 对象；缺省使用一组由主题令牌
派生的 6 色（brand 渐变 / brand-2 / ok / warn / danger / neutral），随主题切换。
选中项以「双环」高亮（`currentColor` 描边 + `--pane` 隔绝环）。

**Props**

| 名称           | 类型                                         | 默认值      | 说明                       |
| -------------- | -------------------------------------------- | ----------- | -------------------------- |
| `value`        | `string`                                     | `undefined` | 当前选中值（受控）         |
| `onChange`     | `(value: string) => void`                    | `undefined` | 选中变更回调               |
| `colors`       | `ReadonlyArray<string \| ColorSwatchOption>` | 内置 6 色   | 色板选项；字符串按纯色处理 |
| `size`         | `'sm' / 'md' / 'lg'`                         | `'md'`      | 色块尺寸 20 / 26 / 32 px   |
| `disabled`     | `boolean`                                    | `false`     | 整体禁用                   |
| `className`    | `string`                                     | `undefined` | 合并到根节点               |
| `'aria-label'` | `string`                                     | `undefined` | 色板组无障碍名称           |

`ColorSwatchOption`：`value: string`（与 `value` 比较）、`css: string`（任意 CSS 颜色 / 渐变）、
`ring?: string`（选中环颜色，渐变选项务必显式提供，否则退化为渐变本身导致对比不足）。

**关键类名**：`.wf-swatch`、`.wf-swatch--sm/lg`、`.wf-swatch__item`、`.wf-swatch__item.is-active`。

**键盘与无障碍**：`role="radiogroup"` + 每项 `role="radio"` + `aria-checked`；
roving `tabIndex`（仅选中项可 Tab 进入）。方向键（←↑ / →↓）循环切换，`Home` / `End` 跳首尾，
切换即触发 `onChange` 并移动焦点。hover 仅描边变化，无位移（§8）。

**示例**

```tsx
<ColorSwatchPicker
  aria-label={t('book.coverColor')}
  value={coverTone}
  onChange={setCoverTone}
  colors={['var(--brand)', 'var(--ok)', 'var(--warn)']}
/>
```

### 3.6 Combobox

**用途**：可搜索的下拉组合框。输入框即触发器，聚焦时展示全量候选，输入后按 `label`
做**不区分大小写的包含匹配**。视觉复用 `Select` 的 `.wf-select` 系列类，面板 portal 到 body
并 `position: fixed` 定位。

> **无默认导出**，只能 `import { Combobox } from '...'`。

**Props**

| 名称          | 类型                      | 默认值                  | 说明                                              |
| ------------- | ------------------------- | ----------------------- | ------------------------------------------------- |
| `options`     | `ComboboxOption[]`        | 必填                    | 候选列表：`{ value, label }`                      |
| `value`       | `string`                  | `undefined`             | 当前选中值（受控）                                |
| `onChange`    | `(value: string) => void` | `undefined`             | 选中回调；输入文本与已选 `label` 不一致时回传空串 |
| `placeholder` | `string`                  | `undefined`             | 占位文案                                          |
| `ariaLabel`   | `string`                  | `undefined`             | 无可见标签时的无障碍名称                          |
| `size`        | `'sm' / 'md' / 'lg'`      | 不传（等同 `md`）       | 控件尺寸                                          |
| `disabled`    | `boolean`                 | `false`                 | 禁用                                              |
| `emptyText`   | `string`                  | `t('common.noOptions')` | 过滤后无候选的提示                                |

**关键类名**：`.wf-select` + `.wf-combobox`、`.wf-select--sm/lg`、`.wf-select.is-open`、
`.wf-select__trigger.wf-combobox__input`、`.wf-select__caret`、`.wf-select__panel`、
`.wf-select__option`（`is-selected` / `is-active`）、`.wf-select__empty`、`.wf-select__check`。

**键盘与无障碍**：输入框为 `role="combobox"`，带 `aria-expanded` / `aria-controls` /
`aria-autocomplete="list"` / `aria-activedescendant`；面板 `role="listbox"`，选项 `role="option"`

- `aria-selected`。↑↓ 循环高亮（未展开时先展开），Enter 提交，Esc 关闭，Tab 关闭并让出焦点；
  点击组件外部关闭。面板下方空间不足时自动上翻，滚动 / 缩放重算位置。

**示例**

```tsx
<Combobox
  ariaLabel={t('dossier.relationTarget')}
  options={entities.map((e) => ({ value: e.id, label: e.name }))}
  value={targetId}
  onChange={setTargetId}
  emptyText={t('dossier.noMatch')}
/>
```

### 3.7 Dropdown

**用途**：下拉菜单。触发器可为节点或渲染函数（函数收到 `{ open }` 以切换箭头 / 高亮），
菜单项支持图标、禁用、勾选态与分隔线。点击组件外部关闭。

**Props**

| 名称           | 类型                                                    | 默认值      | 说明                    |
| -------------- | ------------------------------------------------------- | ----------- | ----------------------- |
| `trigger`      | `ReactNode / ((state: { open: boolean }) => ReactNode)` | 必填        | 触发器节点或渲染函数    |
| `items`        | `DropdownItem[]`                                        | 必填        | 菜单项列表              |
| `align`        | `'start' / 'end'`                                       | `'start'`   | 菜单对齐（贴左 / 贴右） |
| `disabled`     | `boolean`                                               | `false`     | 禁用整个下拉            |
| `className`    | `string`                                                | `undefined` | 透传到根节点            |
| `onOpenChange` | `(open: boolean) => void`                               | `undefined` | 展开状态变化回调        |

`DropdownItem`：`key: string`、`label?: ReactNode`、`icon?: ReactNode`、`disabled?: boolean`、
`checked?: boolean`（提供该字段即以 `menuitemcheckbox` 语义渲染并以品牌色高亮）、`onSelect?: () => void`、
`separator?: boolean`（渲染分隔线，忽略其余字段）。

**关键类名**：`.wf-dropdown`（`is-open` / `is-disabled`）、`.wf-dropdown__trigger`、
`.wf-dropdown__menu`（`--start` / `--end`）、`.wf-dropdown__item`（`is-active` / `is-checked` / `is-disabled`）、
`.wf-dropdown__icon/__label/__check/__sep`。

**键盘与无障碍**：根节点监听 keydown——↑↓ 循环（自动跳过分隔线与禁用项）、`Home` / `End` 跳首尾、
Enter / Space 打开或提交、Esc 关闭、Tab 关闭。仅键盘导航时把焦点移入菜单项，鼠标 hover 只高亮。
菜单 `role="menu"`，项为 `menuitem` / `menuitemcheckbox` + `aria-checked`。
**注意：触发器容器是 `<span>`，自身不带 `tabIndex` / `role`**——必须把 `Button` / `IconButton`
之类的可聚焦控件传进 `trigger`，否则键盘用户无法进入菜单。

**示例**

```tsx
<Dropdown
  align="end"
  trigger={({ open }) => (
    <IconButton label={t('action.more')} variant={open ? 'solid' : 'ghost'}>
      <MoreIcon />
    </IconButton>
  )}
  items={[
    { key: 'rename', label: t('action.rename'), onSelect: rename },
    { key: 'sep', separator: true },
    { key: 'delete', label: t('action.delete'), onSelect: remove }
  ]}
/>
```

### 3.8 FormField

**用途**：字段容器。统一 `label` / 必填星号 / 控件区 / `hint` 或 `error` 的布局与间距，
包裹任意表单控件（Input、Select、ChipInput、ColorSwatchPicker…）。`error` 存在时进入错误态并优先于 `hint`。

**Props**（继承 `HTMLAttributes<HTMLDivElement>`）

| 名称       | 类型        | 默认值      | 说明                                          |
| ---------- | ----------- | ----------- | --------------------------------------------- |
| `label`    | `ReactNode` | `undefined` | 字段标签，渲染为 `<label htmlFor>`            |
| `htmlFor`  | `string`    | `undefined` | 关联控件 id                                   |
| `hint`     | `ReactNode` | `undefined` | 辅助说明；无 `error` 时展示                   |
| `error`    | `ReactNode` | `undefined` | 错误信息；非空时展示并加 `is-invalid`         |
| `required` | `boolean`   | `false`     | 显示必填星号（`aria-hidden`，不改变原生校验） |
| `children` | `ReactNode` | `undefined` | 被包裹的控件                                  |

**关键类名**：`.wf-field`、`.wf-field.is-invalid`、`.wf-field__label`、`.wf-field__required`、
`.wf-field__control`、`.wf-field__hint`、`.wf-field__error`。

**键盘与无障碍**：`label` 通过 `htmlFor` 关联控件；错误信息 `role="alert"` 自动播报。
提示 / 错误节点 id 为 `${htmlFor ?? 内部 useId}-message`：
**传了 `htmlFor` 时**，调用方可在控件上写 `aria-describedby`，值为 `${htmlFor}-message`，把它挂到控件上
（组件不会自动挂）；不传 `htmlFor` 时 id 由内部 `useId` 生成，外部无法引用，仅靠视觉提示。
`required` 只是视觉星号，需要语义时在控件上另外传 `required` / `aria-required`。

**示例**

```tsx
<FormField
  label={t('book.title')}
  htmlFor="book-title"
  required
  error={titleError}
  hint={t('book.titleHint')}
>
  <Input
    id="book-title"
    value={title}
    invalid={Boolean(titleError)}
    aria-describedby="book-title-message"
    onChange={(e) => setTitle(e.target.value)}
  />
</FormField>
```

### 3.9 IconButton

**用途**：圆形图标按钮，承载单个图标。自带**自绘 tooltip**（hover / focus 显示，带延迟与
视口避让），并把原生 `title` 属性剥离，避免系统气泡与自绘浮层重复提示。

**Props**（继承 `ButtonHTMLAttributes<HTMLButtonElement>`）

| 名称               | 类型                                  | 默认值      | 说明                                                              |
| ------------------ | ------------------------------------- | ----------- | ----------------------------------------------------------------- |
| `variant`          | `'ghost' / 'solid'`                   | `'ghost'`   | `ghost` 无底色（hover 出底）/ `solid` 常备柔和底                  |
| `size`             | `'sm' / 'md'`                         | `'md'`      | 尺寸；`md` 不输出尺寸类                                           |
| `tone`             | `'default' / 'danger'`                | `'default'` | `danger` 时 hover 呈危险色                                        |
| `label`            | `string`                              | **必填**    | 映射为 `aria-label`，同时作为 tooltip 默认文案                    |
| `tooltip`          | `string`                              | `undefined` | 覆盖 tooltip 文案（如 `label="设置" tooltip="设置（即将推出）"`） |
| `tooltipPlacement` | `'top' / 'right' / 'bottom' / 'left'` | `'bottom'`  | tooltip 首选方向，运行时仍会自动避让                              |
| `children`         | `ReactNode`                           | `undefined` | 图标（建议内联 SVG，随 `currentColor` 着色）                      |

**关键类名**：`.wf-iconbtn`、`.wf-iconbtn--ghost/solid`、`.wf-iconbtn--default/danger`、
`.wf-iconbtn--sm`。

**键盘与无障碍**：原生按钮，Enter / Space 触发；可访问名称来自必填 `label`；
tooltip 通过 `aria-describedby` 关联（仅在有文案时）。`title` 被有意丢弃（`void _title`），
所以**不要指望 `title` 生效**，说明性文字一律走 `tooltip`。转发 `ref` 与内部 `anchorRef`
在 `setRef` 中合并，外部 `ref` 拿到的仍是真实 `<button>`。

**示例**

```tsx
<IconButton
  label={t('action.settings')}
  tone="default"
  variant="ghost"
  onClick={openSettings}
  tooltipPlacement="right"
>
  <GearIcon />
</IconButton>
```

### 3.10 Input

**用途**：单行文本输入。透传原生 `<input>` 属性，`size` 是控件尺寸（不是原生字符宽度），
`invalid` 同时写 `aria-invalid` 与 `is-invalid` 类。

> **无默认导出**，只能 `import { Input } from '...'`。

**Props**（继承 `Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>`）

| 名称                    | 类型                 | 默认值            | 说明                                    |
| ----------------------- | -------------------- | ----------------- | --------------------------------------- |
| `size`                  | `'sm' / 'md' / 'lg'` | 不传（等同 `md`） | 控件尺寸；仅 `sm` / `lg` 输出修饰类     |
| `invalid`               | `boolean`            | `false`           | 错误态：`aria-invalid` + `is-invalid`   |
| `type`                  | 原生                 | `'text'`          | 输入类型                                |
| `readOnly` / `disabled` | 原生                 | `undefined`       | 只读 / 禁用（只读时底色与光标同步降级） |

**关键类名**：`.wf-input`、`.wf-input--sm/lg`、`.wf-input.is-invalid`（也支持
`[aria-invalid='true']` 选择器）；父容器加 `.on-soft` 可在柔和底容器上换用更深的控件底色。

**键盘与无障碍**：完全使用原生输入行为，无自定义键盘处理。组件**不带标签**，
必须经 `FormField` 的 `label` + `htmlFor`（或 `aria-label`）提供可访问名称；
错误文案需自行用 `aria-describedby` 关联。

**示例**

```tsx
<Input
  id="book-author"
  value={author}
  invalid={!author}
  placeholder={t('book.authorPlaceholder')}
  onChange={(e) => setAuthor(e.target.value)}
/>
```

### 3.11 Modal

**用途**：模态弹窗。遮罩 + 面板（面板复用 `Window` 结构），支持嵌套（模块级弹窗栈）、
Tab 焦点陷阱、背景 `inert`、`body` 滚动锁、退场动画（关闭时先播完动画再卸载）。

**Props**

| 名称             | 类型                        | 默认值              | 说明                                           |
| ---------------- | --------------------------- | ------------------- | ---------------------------------------------- |
| `open`           | `boolean`                   | 必填                | 是否显示                                       |
| `onClose`        | `() => void`                | 必填                | 关闭回调（遮罩 / Esc / 关闭按钮）              |
| `title`          | `ReactNode`                 | `undefined`         | 标题，提供后渲染头部                           |
| `footer`         | `ReactNode`                 | `undefined`         | 底部操作区                                     |
| `size`           | `'sm' / 'md' / 'lg' / 'xl'` | `'md'`              | 面板宽度档位：360 / 480 / 640 / 880 px         |
| `closeOnMask`    | `boolean`                   | `true`              | 点击遮罩是否关闭                               |
| `closeOnEsc`     | `boolean`                   | `true`              | Esc 是否关闭（仅栈顶响应）                     |
| `showClose`      | `boolean`                   | `true`              | 是否显示右上角关闭按钮                         |
| `closeLabel`     | `string`                    | `t('common.close')` | 关闭按钮无障碍标签                             |
| `ariaLabel`      | `string`                    | `undefined`         | 对话框无障碍名称（无可见标题时用）             |
| `panelClassName` | `string`                    | `undefined`         | 透传到面板类名                                 |
| `maskClassName`  | `string`                    | `undefined`         | 遮罩附加类名（加强模糊 / 调遮罩）              |
| `coverTitlebar`  | `boolean`                   | `true`              | 遮罩是否覆盖标题栏；`false` 时标题栏保持可交互 |

**关键类名**：`.wf-modal`、`.wf-modal--no-titlebar`（`coverTitlebar={false}`）、`.wf-modal.is-closing`、
`.wf-modal__mask`（`is-closing`）、`.wf-modal__panel`（`is-closing`）；面板内部是
`.wf-window__head/__title/__close/__body/__footer`。

**键盘与无障碍**：`role="dialog"` + `aria-modal="true"`，面板 `tabIndex={-1}` 打开即聚焦；
Tab / Shift+Tab 在面板内首尾循环（无可聚焦元素时落回面板）；Esc 仅由**栈顶**弹窗响应，
嵌套时一次只关一层。打开期间背景加 `inert`：`coverTitlebar` 为 `true` 时作用于 `#root`
（全屏遮罩），为 `false` 时收窄到 `main.app-viewport`（标题栏可点，供齿轮自行关闭）。
退场动画期间容器 `inert`，逻辑上已关闭、视觉上仍在淡出；内容用打开态快照渲染，避免淡出时塌成空壳。
系统开启「减少动态效果」时不播退场动画。

**示例**

```tsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title={t('book.deleteTitle')}
  size="sm"
  footer={
    <>
      <Button onClick={() => setOpen(false)}>{t('action.cancel')}</Button>
      <Button variant="danger" onClick={confirmDelete}>
        {t('action.delete')}
      </Button>
    </>
  }
>
  <p>{t('book.deleteConfirm', { title })}</p>
</Modal>
```

### 3.12 Progress

**用途**：进度条。轨道为柔和底、填充为品牌渐变（或语义色）；只支持确定进度，
无 indeterminate 模式。

**Props**（继承 `HTMLAttributes<HTMLDivElement>`）

| 名称    | 类型                                 | 默认值      | 说明                            |
| ------- | ------------------------------------ | ----------- | ------------------------------- |
| `value` | `number`                             | `0`         | 当前值，自动夹取到 `[0, max]`   |
| `max`   | `number`                             | `100`       | 最大值；`max <= 0` 时回退为 100 |
| `tone`  | `'brand' / 'ok' / 'warn' / 'danger'` | `'brand'`   | 填充色调                        |
| `size`  | `'sm' / 'md' / 'lg'`                 | `'md'`      | 高度 3 / 4 / 6 px               |
| `label` | `string`                             | `undefined` | 无障碍名称                      |

**关键类名**：`.wf-progress`、`.wf-progress--sm/md/lg`、`.wf-progress__bar`、
`.wf-progress__bar--ok/warn/danger`（`brand` 用基础渐变，无修饰类）。

**键盘与无障碍**：`role="progressbar"` + `aria-valuenow` / `aria-valuemin` / `aria-valuemax`，
不可聚焦。数值已夹取后写入 `aria-valuenow`，读屏读到的是实际生效值；`label` 建议描述进度含义
（如「本章完成度」），不要只写「进度」。

**示例**

```tsx
<Progress
  value={done}
  max={total}
  tone={done === total ? 'ok' : 'brand'}
  label={t('book.progress')}
/>
```

### 3.13 SearchInput

**用途**：搜索框。前置图标（默认放大镜）+ 原生 `type="search"` 输入 + 可选清除按钮。
受控 / 非受控都支持，转发 `ref`。

**Props**（继承 `InputHTMLAttributes<HTMLInputElement>`）

| 名称                                  | 类型         | 默认值      | 说明                                                 |
| ------------------------------------- | ------------ | ----------- | ---------------------------------------------------- |
| `onClear`                             | `() => void` | `undefined` | 清除回调；**受控模式下必须提供**，否则清除按钮不渲染 |
| `clearable`                           | `boolean`    | `true`      | 是否允许显示清除按钮                                 |
| `icon`                                | `ReactNode`  | 内置放大镜  | 前置图标                                             |
| `value` / `defaultValue` / `onChange` | 原生         | —           | 受控 / 非受控均可                                    |
| `disabled`                            | `boolean`    | `false`     | 禁用（容器加 `is-disabled`，输入框 `disabled`）      |

**关键类名**：`.wf-search`、`.wf-search.is-disabled`、`.wf-search__icon`、`.wf-search__input`、
`.wf-search__clear`。注意 `className` 作用在**外层容器** `.wf-search`，不是 `<input>`。

**键盘与无障碍**：原生输入 + Tab 可达的清除按钮；清除按钮 `aria-label={t('common.clear')}`
且内部图标 `aria-hidden`。清除后焦点回到输入框（非受控时同时清空本地值）。
受控模式下组件不自行改值——只调 `onClear`，值清空由父组件完成。

**示例**

```tsx
<SearchInput
  value={keyword}
  onChange={(e) => setKeyword(e.target.value)}
  onClear={() => setKeyword('')}
  placeholder={t('bookshelf.searchPlaceholder')}
/>
```

### 3.14 Segmented

**用途**：分段控件 / 标签切换。一组互斥 `<button>`，选中项带 `is-active`。
泛型 `<T extends string>` 让 `value` / `onChange` 保持字面量联合类型。

**Props**

| 名称           | 类型                                | 默认值      | 说明                                   |
| -------------- | ----------------------------------- | ----------- | -------------------------------------- |
| `options`      | `ReadonlyArray<SegmentedOption<T>>` | 必填        | 选项：`{ value, label, disabled? }`    |
| `value`        | `T`                                 | 必填        | 当前选中值（受控）                     |
| `onChange`     | `(value: T) => void`                | `undefined` | 选中变更回调                           |
| `size`         | `'sm' / 'md'`                       | `'md'`      | 尺寸                                   |
| `className`    | `string`                            | `undefined` | 合并到根节点（如追加 `.wf-seg--fill`） |
| `'aria-label'` | `string`                            | `undefined` | 分段组无障碍名称                       |

**关键类名**：`.wf-seg`、`.wf-seg--sm`、`.wf-seg--fill`（外部追加的等分变体）、
`.wf-seg__item`、`.wf-seg__item.is-active`（`::before` 画选中底板）。

**键盘与无障碍**：`role="group"` + `aria-label`；每个按钮 `aria-pressed` 表示选中。
**不是** `tablist` / `radiogroup` 语义：所有按钮都参与 Tab 序列，无方向键漫游。
禁用项用原生 `disabled`。受控组件，无 `defaultValue`。

**示例**

```tsx
<Segmented
  aria-label={t('bookshelf.viewMode')}
  value={view}
  onChange={setView}
  options={[
    { value: 'grid', label: t('bookshelf.grid') },
    { value: 'list', label: t('bookshelf.list') }
  ]}
/>
```

### 3.15 Select

**用途**：下拉选择。触发器是原生 `<button>`，面板 portal 到 body 并 `position: fixed`
（逃逸 `overflow` 裁剪），支持禁用项、空态、隐藏 input 参与表单提交。

> **无默认导出**，只能 `import { Select } from '...'`。

**Props**

| 名称          | 类型                      | 默认值                          | 说明                                     |
| ------------- | ------------------------- | ------------------------------- | ---------------------------------------- |
| `value`       | `string`                  | `undefined`                     | 当前值（受控）                           |
| `onChange`    | `(value: string) => void` | `undefined`                     | 选中回调，回传选项 `value`               |
| `options`     | `SelectOption[]`          | 必填                            | `{ value, label, disabled? }`            |
| `placeholder` | `string`                  | `t('common.selectPlaceholder')` | 未选中时的占位文案                       |
| `disabled`    | `boolean`                 | `false`                         | 禁用                                     |
| `size`        | `'sm' / 'md' / 'lg'`      | 不传（等同 `md`）               | 控件尺寸                                 |
| `invalid`     | `boolean`                 | `false`                         | 错误态：`aria-invalid`                   |
| `id`          | `string`                  | 内部 `useId`                    | 触发器 id，并派生 listbox / option 的 id |
| `name`        | `string`                  | `undefined`                     | 提供后渲染同名隐藏 `<input>` 供表单提交  |
| `ariaLabel`   | `string`                  | `undefined`                     | 无障碍名称（无可见标签时）               |
| `emptyText`   | `string`                  | `t('common.noOptions')`         | 面板空态文案                             |
| `className`   | `string`                  | `undefined`                     | 合并到根节点                             |

**关键类名**：`.wf-select`（`is-open` / `is-disabled`）、`.wf-select--sm/lg`、`.wf-select__trigger`、
`.wf-select__value`（`is-placeholder`）、`.wf-select__caret`（展开时翻转）、`.wf-select__panel`、
`.wf-select__option`（`is-selected` / `is-active` / `is-disabled`）、`.wf-select__option-label`、
`.wf-select__check`、`.wf-select__empty`。面板 `z-index: 1040`。

**键盘与无障碍**：触发器 `aria-haspopup="listbox"` + `aria-expanded` + `aria-controls` +
`aria-activedescendant`；面板 `role="listbox"`，选项 `role="option"` + `aria-selected`
（禁用项 `aria-disabled`）。↑↓ 循环（跳禁用项）、`Home` / `End` 首尾、Enter / Space 提交、
Esc 关闭、Tab 关闭；点击外部关闭；下方空间不足自动上翻。

**示例**

```tsx
<Select
  id="book-category"
  value={category}
  onChange={setCategory}
  options={BOOK_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
  placeholder={t('book.categoryPlaceholder')}
/>
```

### 3.16 Switch

**用途**：开关。原生 `<input type="checkbox" role="switch">` 视觉隐藏，自绘轨道 + 滑块。

> **无默认导出**，只能 `import { Switch } from '...'`。

**Props**（继承 `Omit<InputHTMLAttributes<HTMLInputElement>, 'type' / 'size'>`）

| 名称                                      | 类型                 | 默认值            | 说明                             |
| ----------------------------------------- | -------------------- | ----------------- | -------------------------------- |
| `label`                                   | `ReactNode`          | `undefined`       | 标签文本；省略则为纯控件         |
| `size`                                    | `'sm' / 'md' / 'lg'` | 不传（等同 `md`） | 控件尺寸                         |
| `checked` / `defaultChecked` / `onChange` | 原生                 | —                 | 受控 / 非受控均支持              |
| `disabled`                                | `boolean`            | `undefined`       | 原生禁用，额外附加 `is-disabled` |

**关键类名**：`.wf-switch`、`.wf-switch--sm/lg`、`.wf-switch.is-disabled`、
`.wf-switch__input`（视觉隐藏、`role="switch"`）、`.wf-switch__track`、`.wf-switch__thumb`、
`.wf-switch__label`。

**键盘与无障碍**：Space 切换、Tab 可达（原生 checkbox 行为）；`role="switch"` 让读屏播报
「开关」而非「复选框」。`label` 包裹提供可访问名称，省略时需 `aria-label`。
**无 `invalid` / 加载态**——需要错误提示时由外层 `FormField` 承担。

**示例**

```tsx
<Switch
  label={t('settings.autoBackup')}
  checked={autoBackup}
  onChange={(e) => setAutoBackup(e.target.checked)}
/>
```

### 3.17 Tag

**用途**：标签。可关闭（`onClose` 渲染 × 按钮）、可带附加操作（`action`），5 种色调。

**Props**（继承 `HTMLAttributes<HTMLSpanElement>`）

| 名称         | 类型                                             | 默认值               | 说明                                           |
| ------------ | ------------------------------------------------ | -------------------- | ---------------------------------------------- |
| `tone`       | `'neutral' / 'brand' / 'ok' / 'warn' / 'danger'` | `'neutral'`          | 色调                                           |
| `onClose`    | `() => void`                                     | `undefined`          | 提供后显示关闭按钮                             |
| `closeLabel` | `string`                                         | `t('common.remove')` | 关闭按钮无障碍标签                             |
| `action`     | `ReactNode`                                      | `undefined`          | 标签文字与关闭按钮之间的附加操作（如展开编辑） |
| `children`   | `ReactNode`                                      | `undefined`          | 标签文字                                       |

**关键类名**：`.wf-tag`、`.wf-tag--neutral/brand/ok/warn/danger`、`.wf-tag__label`、
`.wf-tag__close`。

**键盘与无障碍**：标签本体是 `<span>`，不可聚焦；关闭按钮是原生 `<button>`，Tab 可达，
点击时 `stopPropagation`（避免冒泡触发外层行点击）。`action` 内若放交互控件需自行保证其语义。
长标签受 `max-width: 100%` 限制，溢出表现由外层容器决定。

**示例**

```tsx
<Tag tone="brand" onClose={() => removeTag(tag.id)}>
  {tag.name}
</Tag>
```

`action` 位于 22px 高的 Tag 内，只能放 14px 级微操作按钮（如 `.dossier-rel-pill__action`）；36px 的 `IconButton size="sm"` 会溢出，不要使用。

### 3.18 Textarea

**用途**：多行文本输入。透传原生 `<textarea>` 属性，默认 `resize: vertical`、最小高度 82px。

> **无默认导出**，只能 `import { Textarea } from '...'`。

**Props**（继承 `TextareaHTMLAttributes<HTMLTextAreaElement>`）

| 名称                                       | 类型                 | 默认值            | 说明                                  |
| ------------------------------------------ | -------------------- | ----------------- | ------------------------------------- |
| `size`                                     | `'sm' / 'md' / 'lg'` | 不传（等同 `md`） | 尺寸：最小高度 62 / 82 / 108 px       |
| `invalid`                                  | `boolean`            | `false`           | 错误态：`aria-invalid` + `is-invalid` |
| `rows` / `value` / `onChange` / `disabled` | 原生                 | —                 | 完全透传                              |

**关键类名**：`.wf-textarea`、`.wf-textarea--sm/lg`、`.wf-textarea.is-invalid`。

**键盘与无障碍**：原生多行输入，无自定义键位。**不带标签**，需 `FormField` 或 `aria-label`；
错误文案自行关联 `aria-describedby`。需要自适应高度时由调用方监听内容计算 `rows` / `style.height`。

**示例**

```tsx
<Textarea
  id="book-summary"
  rows={4}
  value={summary}
  onChange={(e) => setSummary(e.target.value)}
  placeholder={t('book.summaryPlaceholder')}
/>
```

### 3.19 Toast（`useToast` 钩子）

**用途**：命令式轻提示。调用 `show(message)` 弹出一条短提示，默认 2.6s 后淡出。
具体形态与约束见 [§4.1](#41-为什么-toast--tooltip-不是组件)。

> **导出的是钩子不是组件**：`useToast(duration?) => { show, node }`。

| 名称          | 类型                        | 默认值 | 说明                               |
| ------------- | --------------------------- | ------ | ---------------------------------- |
| `duration`    | `number`                    | `2600` | 展示时长（ms），退场淡出另计 200ms |
| 返回值 `show` | `(message: string) => void` | —      | 展示提示（覆盖上一条并重新计时）   |
| 返回值 `node` | `ReactNode`                 | —      | 需挂载到组件树中的浮层节点         |

**关键类名**：`.wf-toast`、`.wf-toast.is-leaving`。

**键盘与无障碍**：`role="status"` + `aria-live="polite"`，不抢焦点、不可交互、不阻塞操作。
文案应简短陈述结果（「已保存」），不要放需要用户决策的内容（用 Modal 替代）。

**示例**

```tsx
const toast = useToast()
return (
  <>
    {toast.node}
    <Button onClick={() => toast.show(t('toast.saved'))}>{t('action.save')}</Button>
  </>
)
```

### 3.20 Tooltip（`useTooltip` 钩子）

**用途**：自绘 tooltip。hover / focus 显示、离开 / 失焦隐藏，带显示 / 隐藏延迟，
浮层按视口空间四方向自动避让。`IconButton` 内部即用它。

> **导出的是钩子不是组件**：
> `useTooltip<T>({ content, placement?, disabled?, showDelay?, hideDelay? }) =>
{ anchorRef, anchorProps, tooltip }`。

| 名称                 | 类型                                  | 默认值     | 说明                                                     |
| -------------------- | ------------------------------------- | ---------- | -------------------------------------------------------- |
| `content`            | `string`                              | 必填       | 提示文本；空串时不显示                                   |
| `placement`          | `'top' / 'right' / 'bottom' / 'left'` | `'bottom'` | 首选方向（运行时会避让）                                 |
| `disabled`           | `boolean`                             | `false`    | 始终不显示（如按钮禁用态）                               |
| `showDelay`          | `number`                              | `350`      | 显示延迟（ms）                                           |
| `hideDelay`          | `number`                              | `60`       | 隐藏延迟（ms）                                           |
| 返回值 `anchorRef`   | `RefObject<T>`                        | —          | 挂到锚点元素上供定位测量                                 |
| 返回值 `anchorProps` | `TooltipAnchorProps`                  | —          | `onMouseEnter/Leave`、`onFocus/Blur`、`aria-describedby` |
| 返回值 `tooltip`     | `ReactNode`                           | —          | 浮层节点（portal 到 body），无内容时 `null`              |

**关键类名**：`.wf-tooltip`、`.wf-tooltip.is-ready`（定位完成前隐藏，避免闪跳）。

**键盘与无障碍**：`role="tooltip"` + 锚点 `aria-describedby` 关联；focus / blur 与 hover 同等触发，
键盘用户可读到。浮层不可聚焦、不接收指针事件之外的交互，`z-index: 990`。

**示例**

```tsx
const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLButtonElement>({
  content: t('toolbar.exportHint'),
  placement: 'top'
})
return (
  <>
    {tooltip}
    <button ref={anchorRef} {...anchorProps} onClick={exportAll}>
      …
    </button>
  </>
)
```

### 3.21 Window

**用途**：窗口框架。标题区 + 可滚动内容区 + 底部操作区（带左右渐隐分隔线）。
`Modal` 的面板与欢迎页共用它，保证浮层与引导卡片外观一致；也可单独用作大卡片。

**Props**（继承 `Omit<HTMLAttributes<HTMLDivElement>, 'title'>`）

| 名称            | 类型                        | 默认值                    | 说明                                                        |
| --------------- | --------------------------- | ------------------------- | ----------------------------------------------------------- |
| `title`         | `ReactNode`                 | `undefined`               | 标题区内容；无标题但有关闭按钮时仍渲染标题区                |
| `onClose`       | `() => void`                | `undefined`               | 关闭回调；提供后默认渲染关闭按钮                            |
| `showClose`     | `boolean`                   | `onClose` 存在时为 `true` | 是否显示关闭按钮（`showClose ?? true` 再与 `onClose` 取与） |
| `closeLabel`    | `string`                    | `t('common.close')`       | 关闭按钮无障碍标签                                          |
| `footer`        | `ReactNode`                 | `undefined`               | 底部操作区                                                  |
| `size`          | `'sm' / 'md' / 'lg' / 'xl'` | `undefined`               | 宽度档位 360 / 480 / 640 / 880 px；不传不限宽               |
| `bodyClassName` | `string`                    | `undefined`               | 透传到内容区                                                |

**关键类名**：`.wf-window`、`.wf-window--sm/md/lg/xl`、`.wf-window__head`、`.wf-window__title`、
`.wf-window__close`、`.wf-window__body`（滚动容器）、`.wf-window__footer`（`::before` 渐隐分隔线）、
`.wf-window__footer .wf-btn`（统一 `min-width: 104px`）。

**键盘与无障碍**：本身是普通 `div`，**不带 `role="dialog"`**——模态语义由 `Modal` 通过
透传属性注入。关闭按钮原生可聚焦、有 `aria-label`。底部按钮统一最小宽度，建议左侧放次要操作、
右侧放主操作（与全站弹窗一致）。

**示例**

```tsx
<Window
  title={t('welcome.title')}
  size="lg"
  onClose={dismiss}
  footer={
    <Button variant="primary" onClick={start}>
      {t('welcome.start')}
    </Button>
  }
>
  <p>{t('welcome.body')}</p>
</Window>
```

---

### 3.22 EntityStyleCard

**用途**：通用「实体样式卡」壳，剧情卡 / 伏笔卡 / 设定档案卡共用。只承载**结构与公共视觉规格**（根布局、标题行、次级胶囊行、描述区、元信息区、底部胶囊区、浮层槽位），不含域业务逻辑。

**Props**

| 名称                   | 类型                                                              | 默认值      | 说明                                                |
| ---------------------- | ----------------------------------------------------------------- | ----------- | --------------------------------------------------- |
| `head`                 | `ReactNode`                                                       | 必填        | 标题行：标题 + 徽章，由调用方组合                   |
| `actions`              | `ReactNode`                                                       | `undefined` | 操作按钮区，放入 `<IconButton size="sm">` 即可      |
| `meta`                 | `ReactNode`                                                       | `undefined` | 次级胶囊行（如别名）                                |
| `description`          | `ReactNode`                                                       | `undefined` | 描述区内容；行数由调用方类控制                      |
| `descriptionClassName` | `string`                                                          | `undefined` | 追加到描述容器的类名（域内裁剪行数 / 缩进）         |
| `info`                 | `ReactNode`                                                       | `undefined` | 元信息区（如伏笔位置行）                            |
| `chips`                | `ReactNode`                                                       | `undefined` | 底部胶囊区内容（关系 / 实体）                       |
| `chipsRef`             | `Ref<HTMLDivElement>`                                             | `undefined` | 底部胶囊容器 ref（`useChipOverflow` 测量用）        |
| `chipsClassName`       | `string`                                                          | `undefined` | 追加到底部胶囊容器的类名                            |
| `chipsProps`           | `Omit<HTMLAttributes<HTMLDivElement>, 'className' \| 'children'>` | `{}`        | 透传到底部胶囊容器的属性                            |
| `popup`                | `ReactNode`                                                       | `undefined` | 浮层（如「+N」弹窗），portal 组件放这里不影响文档流 |
| `active`               | `boolean`                                                         | `false`     | 选中态：根元素追加 `is-active`，由光晕底座接管      |
| `readonly`             | `boolean`                                                         | `false`     | 只读变体：不暗示可点击（光标为默认箭头）            |
| `compact`              | `boolean`                                                         | `false`     | 紧凑变体：只落类名钩子，尺寸由域内样式覆写          |
| `className`            | `string`                                                          | `undefined` | 追加到根 `<article>` 的域语义类名                   |
| `cardProps`            | `Omit<HTMLAttributes<HTMLElement>, 'className' \| 'children'>`    | `{}`        | 透传到根 `<article>` 的交互 / 无障碍属性            |

**关键类名**：`.wf-card--halo.wf-entity-card`（根）、`.is-active`、`.wf-entity-card--readonly`、`.wf-entity-card--compact`、`.wf-entity-card__head/__actions/__meta/__desc/__info/__chips`。

**键盘与无障碍**：根节点是 `<article>`，本身不带 `role` / `tabIndex` / 键盘处理；`active` 只加类，不写 `aria-selected`。整卡可点击时由调用方通过 `cardProps` 传 `role="button"`、`tabIndex={0}`、`onClick` / `onKeyDown`，或把点击语义交给内部控件。`actions` 内的删除按钮应传 `tone="danger"`，编辑 / 关联等用默认 tone。

**样式边界**：`entity-card.css` 由 `styles/index.css:25` 全局引入，组件自身不 import；`.wf-entity-card.wf-card--halo` 取消通用卡 `max-height: 240px` 上限（`entity-card.css:41-45`），hover / 选中光晕复用 `.wf-card--halo`，无 `transform`。

**示例**

```tsx
<EntityStyleCard
  head={<h3 className="wf-entity-card__title">{name}</h3>}
  actions={
    <IconButton size="sm" label={t('action.edit')}>
      <EditIcon />
    </IconButton>
  }
  description={description}
  chips={relations}
  active={selected}
/>
```

### 3.23 Splitter

**用途**：分栏拖拽分隔条（命中区 8px；vertical → `cursor: col-resize`，horizontal → `row-resize`）。hover / 拖拽 / 键盘聚焦时中央浮现品牌色圆条；双击恢复默认值。

**Props**

| 名称             | 类型                                     | 默认值       | 说明                                                             |
| ---------------- | ---------------------------------------- | ------------ | ---------------------------------------------------------------- |
| `orientation`    | `'vertical' \| 'horizontal'`             | `'vertical'` | 分隔条方向，决定拖拽轴、光标与变体类名                           |
| `side`           | `'left' \| 'right' \| 'top' \| 'bottom'` | 必填         | 目标所在侧；vertical 用 left / right，horizontal 用 top / bottom |
| `targetRef`      | `RefObject<HTMLElement \| null>`         | 必填         | 被测量 / 被拖拽的目标栏或容器                                    |
| `min`            | `number`                                 | 必填         | 受控值下限                                                       |
| `max`            | `number`                                 | 必填         | 受控值上限                                                       |
| `value`          | `number`                                 | 必填         | 当前值（受控）                                                   |
| `defaultValue`   | `number`                                 | 必填         | 双击恢复的默认值                                                 |
| `onChange`       | `(value: number) => void`                | 必填         | 值变更回调                                                       |
| `hidden`         | `boolean`                                | `false`      | 隐藏（尺寸归零 + `pointer-events: none`）                        |
| `unit`           | `'px' \| 'percent'`                      | `'px'`       | percent 时 100 = 容器在拖拽轴上的实测尺寸                        |
| `keyboardStepPx` | `number`                                 | `16`         | 方向键每次调整的像素数（按 `unit` 折算）                         |

**关键类名**：`.splitter`、`.splitter-left/right`（vertical）、`.splitter-horizontal`（horizontal）、`.is-hidden`、`.is-dragging`；拖拽期间 `body` 挂 `is-resizing`（上下分栏另挂 `is-resizing-y`）。

**键盘与无障碍**：`role="separator"` + `aria-orientation` + `aria-valuemin/max/now`；percent 模式带 `aria-valuetext`。聚焦后左右键（vertical）/ 上下键（horizontal）调整，每步默认 16px，`clamp` 到 `[min, max]`；双击恢复 `defaultValue`。`hidden` 时 `aria-hidden`、`aria-disabled`、`tabIndex={-1}` 同时生效。

**样式边界**：样式在 `styles/writer.css:64-133`（`.splitter*`），由 `pages/Writer.tsx:34` 全局引入，组件自身不 import；在写作页之外复用前需先把样式迁到组件层。

**示例**

```tsx
<Splitter
  side="right"
  targetRef={rightPaneRef}
  min={320}
  max={720}
  value={rightWidth}
  defaultValue={600}
  onChange={setRightWidth}
/>
```

## 4. 钩子形态：Toast 与 Tooltip

23 项里有 2 项不是组件，而是**返回「节点 + 控制器」的钩子**：`useToast` 与 `useTooltip`。
这也是全库唯一偏离「组件 + props」形态的地方（`useTooltip` 自 `IconButton` 内复用，
`useToast` 与 `pages/writer/chapters/useConfirm` 的命令式风格保持一致）。

### 4.1 为什么 Toast / Tooltip 不是组件

| 维度          | 组件形态                         | 钩子形态（当前实现）                        | 采用钩子的原因                                                     |
| ------------- | -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| 调用方式      | 父组件维护 `open` 状态，传 props | 调用 `show(msg)` / 挂 `anchorProps` 即可    | 提示是「一次性动作」而非持续 UI 状态，父组件不必为每条提示加 state |
| 挂载位置      | 由父组件在 JSX 中放置            | 钩子返回 `node` / `tooltip`，父组件渲染一次 | 浮层内部 `createPortal` 到 `body`，位置与父组件布局解耦            |
| 定时器 / 定位 | 需在组件内用 effect 管理         | 钩子内 `useRef` 持有定时器，卸载统一清理    | 避免每个调用点重复写清理逻辑                                       |
| 与调用点耦合  | 低（纯受控）                     | 中（必须渲染返回节点）                      | Toast 需要「命令式一行调用」；Tooltip 需要「把属性展开到任意锚点」 |

**关键差异**：钩子不能单独渲染，**必须与一个挂载点绑定**——漏掉 `node` / `tooltip`
就什么也看不到（也不会报错），这是最常见的接入错误。

### 4.2 `useToast`

```ts
const toast = useToast() // duration 默认 2600ms
// toast.show(message: string): void
// toast.node: ReactNode
```

**返回值结构**

- `show(message)`：立刻用新消息覆盖当前提示并重新计时；内部会先清掉旧定时器，
  快速连续调用不会出现「旧提示提前消失 / 多条叠加」。
- `node`：经 `createPortal` 挂到 `document.body` 的浮层，`role="status"` + `aria-live="polite"`，
  退场时加 `is-leaving`（仅 opacity 过渡，无位移 / 缩放）。

**时序**：展示 `duration`（默认 2600ms）→ 加 `is-leaving` → 200ms 后卸载。

**使用约束**

1. **只渲染一次 `node`**：放在组件 `return` 的顶层（Fragment 或布局根内），不要放进条件分支，
   否则提示可能随分支卸载而消失。
2. **一个调用点一个 hook 实例**：同一组件内两次 `useToast()` 会得到两个互不覆盖的浮层；
   需要「全站统一提示」时应在共同祖先调用并向下传递，而不是每处各建一个。
3. **`duration` 只影响之后的调用**：它参与 `show` 的依赖，修改后新的 `show()` 用新时长，
   已在计时的提示仍按旧时长退场；需要并存两种时长请建两个实例。
4. **只用于结果反馈**：文案简短、无操作按钮。需要用户确认 / 输入时用 `Modal`。
5. **SSR / 无 `document` 环境**返回 `null`，不会抛错。

### 4.3 `useTooltip`

```ts
const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLButtonElement>({
  content: t('...'),
  placement: 'top',
  showDelay: 350,
  hideDelay: 60
})
```

**返回值结构**

- `anchorRef`：`RefObject<T>`，用于 `getBoundingClientRect()` 测量锚点，**必须**挂到触发元素上。
- `anchorProps`：`onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` + `aria-describedby`；
  **不含 `ref`**，需要与外部 ref 合并时按 `IconButton` 的写法（回调 ref 同时写 `anchorRef.current`
  与转发 ref）。
- `tooltip`：`role="tooltip"` 浮层节点，`is-ready` 标记定位完成；无内容 / 未展示时为 `null`。

**定位逻辑**：以首选方向起算，四个方向中优先选「完全不越界」者，否则取越界最小者，
最后把坐标夹取回视口内；滚动 / 缩放时重算。

**使用约束**

1. **必须同时渲染 `tooltip` 并挂 `anchorRef`**，缺一不可；`anchorProps` 用展开写法。
2. **`content` 为空串不显示**，可用于「按条件决定是否有提示」，不要在调用处写三元再传 `undefined`。
3. **禁用态用 `disabled: true`**：原生 `disabled` 按钮不触发鼠标事件，飘层逻辑不会启动，
   但保留 `disabled` 参数可让「逻辑禁用」的按钮也不弹提示。
4. **不要与原生 `title` 并用**（会双份提示）；`IconButton` 已主动剥离 `title`。
5. **`placement` 只是首选**：视口边缘会自动翻转，不要依赖它做精确布局。
6. **不承载交互内容**：tooltip 内只放文本，不放按钮 / 链接（浮层不可聚焦，键盘无法到达）。

### 4.4 二者共用的浮层约束

- 都经 `createPortal` 挂到 `document.body`，使用 `position: fixed` 与视口坐标；
  因此在 `transform` 祖先内也能正确定位。
- 层序：Tooltip `990` < Modal `1000` < Select / Combobox 面板 `1040` < Toast `1100`。
  Toast 永远在最上层，Tooltip 不会盖住 Modal——这是有意的：模态打开时不应再出现游离提示。
- 动画只用 opacity（Toast）与「先隐藏后定位」（Tooltip 的 `is-ready`），不做位移 / 缩放（§8）。

---

## 5. 新增组件的通用化检查表

来自 `AGENTS.md` §9「组件通用化约束」，新增 / 改动组件前逐条过一遍：

### 5.1 先检索，再动手

- [ ] **已在 `components/ui/` 搜索同类组件**（按用途搜 `Button`、`Select`、`Tag`…，
      而非只看名字）。同类型已有实现时，**不得**新建平行组件。
- [ ] 检查是否只是现有组件的**变体**：形态差异（尺寸 / 色调 / 有无图标）→ 加 `variant` /
      `size` / `tone`；结构差异（多一个插槽）→ 加 `ReactNode` prop 或 `children`。
- [ ] 检查 `pages/`、`shell/` 下是否已有**两处以上**的相同结构 / 行为——有则应上提共享，
      而不是在第三处继续复制。
- [ ] 检查 `styles/components/` 是否已有可复用的 `wf-` 类；能靠 `className` 追加修饰类解决的，
      不新建 CSS 文件。

### 5.2 差异用参数表达

- [ ] 特殊要求通过 **props / 配置 / children（插槽）/ CSS 变量 / 条件类** 表达，
      **不得**为单个调用点复制整份组件。
- [ ] 布尔开关控制在必要范围；能由数据推导的（如 `hasError = error !== undefined`）不要暴露成 prop。
- [ ] 文案一律走 `t()`（§10），组件内文案统一落在 `common` 命名空间；不硬编码中文。
- [ ] 组件内置的默认值（尺寸、超时、上限）写成**具名常量**并在 props 表里登记，便于文档与测试对齐。

### 5.3 确需独立实现时的登记

- [ ] 若域差异不可调和（例如编辑器内的节点渲染），**在代码注释处写明理由**（引用 §9 例外条款），
      并在本文档对应小节补一句「为何不复用」。
- [ ] 不得以「改起来麻烦」为由另起一套；平行实现一旦出现，须在后续批次收敛
      （行为 hook → 共享行组件 → CSS 收敛，域特有逻辑留在页面层）。

### 5.4 交付前自检（本仓库口径）

- [ ] 单文件 ≤ **500 行**（`AGENTS.md` §3 硬约束）；接近上限即按职责拆分。
- [ ] 具名导出 + 默认导出（若要进桶文件且需默认导出兼容）；**props 类型名全局唯一**，
      否则 `index.ts` 的 `export *` 会冲突。
- [ ] 新组件在 `index.ts` 增加一行 `export * from './Xxx'`，并同步本文档总览表与详解。
- [ ] 类名 `wf-` 前缀、BEM + `is-*` 状态、颜色只取主题令牌。
- [ ] 键盘可达（Tab 序、Enter / Space、Esc）、有可访问名称、状态用 ARIA 表达。
- [ ] hover 无 `transform`（§8），卡片类只用颜色 / 描边 / 阴影。
- [ ] 若属于**用户可感知的功能变更**，同步更新教学书种子（`seedGuideBook/`，§7.5）。
- [ ] 静态检查：`npm run typecheck`、`npm run lint`；不额外编写冒烟测试（§7）。

### 5.5 常见误用速查

| 现象                                   | 原因                               | 正确做法                                                                |
| -------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| `import Input from './Input'` 编译报错 | 该模块无默认导出                   | 改具名导入（见 1.3）                                                    |
| Toast 不显示                           | 忘了渲染 `toast.node`              | 在 `return` 顶层渲染一次                                                |
| Tooltip 不显示                         | 没挂 `anchorRef` 或 `content` 为空 | 同时渲染 `tooltip` 并挂 ref                                             |
| 下拉菜单键盘进不去                     | `trigger` 传了纯文本               | 传 `Button` / `IconButton` 等可聚焦控件                                 |
| 卡片点击无键盘支持                     | `Card interactive` 只加样式        | 把点击语义交给内部 `Button`，或自行补 role / tabIndex                   |
| Select 面板被裁切                      | 自建绝对定位面板                   | 用组件自带 portal 面板，勿在下拉内套 `overflow: hidden`                 |
| 表单错误读屏不播报                     | 未关联 `aria-describedby`          | 传 `htmlFor`，并在控件上用 `aria-describedby="&lt;id&gt;-message"` 关联 |
| 输入框标签缺失                         | `Input` / `Textarea` 不带标签      | 用 `FormField` 包裹                                                     |
| 计数徽标读屏不完整                     | `99+` 截断                         | 容器补 `aria-label` 给完整数值                                          |

---

## 6. 附录

### 6.1 待办 / 已知偏差

- `components/ui/index.ts` 顶部注释写「已核对 23 个组件」，与实际 23 个模块数一致；严格口径为
  21 个组件 + 2 个钩子，无需再改数字。
- `Card interactive` 只提供视觉，不提供按钮语义，需调用方补齐。
- 已移除的 Accordion / Avatar / Checkbox / Divider / Drawer / Radio 仍有
  CSS 残留（`surface.css`、`display-extras.css`、`overlay.css`、`form.css`），
  组件层无 TSX 调用点；清理计划见 `design-language.md` §10。
- Stepper 的 CSS 已删除（2026-11-13）；`common` 命名空间的 `stepper*` 键为历史遗留，待清理。

---

最后核对：2026-11-13
