/**
 * 「默认打开视图」设置的口径（`defaultView` 键）。
 *
 * 取值与落地语义：
 * - `bookshelf`：启动停留在书架（`/`，应用既有默认行为）；
 * - `chapter`：启动直接打开**最近编辑的书**（按 `updatedAt` 降序取首本）并进入章节视图；
 * - `outline`：同上，但首屏进入大纲视图。
 *
 * 历史值 `recent` 未实现「最近打开列表」，已从档位中移除；
 * 任何未知 / 非法值一律回落 `bookshelf`（默认首页），避免启动落到不存在的页面。
 */
export const DEFAULT_VIEW_SETTING_KEY = 'defaultView'

/** 默认视图档位（顺序即设置页下拉顺序）。 */
export const DEFAULT_VIEW_OPTIONS = ['bookshelf', 'chapter', 'outline'] as const

export type DefaultView = (typeof DEFAULT_VIEW_OPTIONS)[number]

/** 默认档位（书架 = 既有启动行为，不改变未配置用户的习惯）。 */
export const DEFAULT_DEFAULT_VIEW: DefaultView = 'bookshelf'

/** 把数据库字符串（可能为 null / 历史值 / 脏值）规整为合法档位。 */
export function resolveDefaultView(raw: string | null | undefined): DefaultView {
  return DEFAULT_VIEW_OPTIONS.some((option) => option === raw)
    ? (raw as DefaultView)
    : DEFAULT_DEFAULT_VIEW
}

/** 是否需要在启动时直接进入写作页（书架档不需要跳转）。 */
export function isWriterDefaultView(view: DefaultView): view is 'chapter' | 'outline' {
  return view === 'chapter' || view === 'outline'
}
