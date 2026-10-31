/**
 * preload 类型入口（渲染层经 `window.api` 取类型的**唯一全局声明点**）。
 *
 * §3 单文件 ≤500 行：原 611→665 行的类型镜像已按域拆到 `src/preload/types/`：
 * - `types/window.d.ts`：`Api` 接口（通道签名装配）与 `declare global` 目标；
 * - `types/database.d.ts`：书籍 / 段落 / 卷章 / 统计 / 搜索 / 回收站（单一真源 `import type`）；
 * - `types/outline.d.ts`：大纲域类型；
 * - `types/entities.d.ts`：实体域类型；
 * - `types/plot.d.ts`：剧情域（含场景关联设定）+ 窗口域形状。
 *
 * 本文件只做两件事：从 `./types/window` 取 `Api`，并把它挂到全局 `Window.api`。
 * 各域类型一律经 `import type` 从主进程数据层取用（编译期擦除，不污染 renderer bundle）。
 * 改主进程通道须同步 `index.ts` 的 `api` 对象与 `types/window.d.ts` 的 `Api` 签名。
 */

import type { Api } from './types/window'

declare global {
  interface Window {
    api: Api
  }
}

export {}
