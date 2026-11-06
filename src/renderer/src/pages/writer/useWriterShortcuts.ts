import { useEffect } from 'react'
import { createLogger } from '@renderer/lib/log'
import { WRITER_MODULES } from '../../shell/activityBarModules'
import type { WriterModule } from '../../shell/activityBarModules'

/** 快捷键保存失败日志（无独立 UI 提示：各模块保存状态 / 脏态本身即反馈）。 */
const log = createLogger('writerShortcuts')

/** 支持查找替换浮窗的模块（其余模块按 Ctrl+F 不响应）。 */
const SEARCHABLE_MODULES: readonly WriterModule[] = ['chapters', 'outline']

export interface WriterShortcutsOptions {
  /** 当前活动模块（外壳活动栏真源）。 */
  active: WriterModule
  /** 切换模块（写作页 `useWriterModuleSwitch.handleSwitch`，自带未保存草稿守卫）。 */
  switchModule: (module: WriterModule) => void
  /** 当前模块立即落盘（`useFlushAllModules.flushModule`；返回真实成败）。 */
  saveModule: (module: WriterModule) => Promise<boolean>
}

/**
 * 是否有模态弹窗打开（确认框 / 新建弹窗 / 词库等）。
 *
 * 弹窗打开时 Ctrl+F 与 Ctrl+1..9 让位：搜索浮窗会被弹窗挡住，切模块也会把弹窗
 * 之后的上下文改掉。Ctrl+S 不受此限——保存后台模块不影响弹窗内编辑。
 */
function hasOpenDialog(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null
}

/**
 * 打开 / 聚焦当前模块的查找替换浮窗。
 *
 * 搜索开关（`searchOpen`）是 `ChaptersView` / `OutlineEditor` 的私有 state，两视图
 * 不在本批改动范围内，故复用它们既有的标题栏搜索按钮（`data-search-toggle`；
 * 外壳只渲染**活动模块**注册的动作，全局唯一）：浮窗已开则把焦点送回搜索框
 * （等价浏览器的「再按一次 Ctrl+F」），未开则点按钮打开（浮窗打开时会自行聚焦输入框）。
 */
function openActiveSearch(): void {
  // `.ep-view` 常驻挂载、仅以 `is-active` 切换可见性：必须限定活动视图，
  // 否则切到其它模块后残留的展开浮窗会被误判为「已打开」。
  const input = document.querySelector<HTMLInputElement>('.ep-view.is-active .ep-search-input')
  if (input) {
    input.focus()
    return
  }
  document.querySelector<HTMLElement>('.tb-module-actions [data-search-toggle]')?.click()
}

/**
 * 写作页全局快捷键（仅在 `Writer` 挂载期间生效）。
 *
 * 应用菜单已在主进程移除（`Menu.setApplicationMenu(null)`），菜单加速键全部失效，
 * 因此快捷键在渲染层用原生 `keydown` 注册：
 * - `Ctrl/Cmd + S`：保存当前模块（复用各模块既有落盘入口，不新造保存逻辑）；
 * - `Ctrl/Cmd + F`：打开当前模块搜索（仅章节 / 大纲，其余模块不响应）；
 * - `Ctrl/Cmd + 1..9`：切换活动栏第 N 个模块（超出数量不响应）；
 * - `Escape` **不接管**：弹窗、搜索浮窗、内联改名等各自的 Esc 处理保持原样。
 *
 * 只匹配 `event.key` 的精确单键（`s` / `f` / `1..9`），且要求无 Alt / Shift，
 * 因此 `Ctrl+C/V/X/Z/Y/A` 等编辑器与系统组合、`Ctrl+Shift+*` 一概不拦截；
 * `event.isComposing` 时直接返回，避免中文输入法组字阶段误触。
 */
export function useWriterShortcuts({
  active,
  switchModule,
  saveModule
}: WriterShortcutsOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // 已被上层（弹窗 / 浮层）处理的按键不重复响应；IME 组字中不响应。
      if (event.defaultPrevented || event.isComposing) return
      // 只认 Ctrl（Windows / Linux）或 Cmd（macOS），且不叠加 Alt / Shift。
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return

      const key = event.key.toLowerCase()

      if (key === 's') {
        // 必须 preventDefault：否则 Electron 可能触发浏览器的「保存网页」。
        event.preventDefault()
        void saveModule(active).then((ok) => {
          if (!ok) log.warn('Ctrl+S 保存失败（脏态保留，可重试）')
        })
        return
      }

      // 弹窗打开时搜索 / 切模块让位（Esc 与按钮仍由弹窗自身处理）。
      if (hasOpenDialog()) return

      if (key === 'f') {
        // 其它模块没有搜索浮窗：不响应，也不 preventDefault（不干扰浏览器默认行为）。
        if (!SEARCHABLE_MODULES.includes(active)) return
        event.preventDefault()
        openActiveSearch()
        return
      }

      if (key.length === 1 && key >= '1' && key <= '9') {
        const target = WRITER_MODULES[Number(key) - 1]
        if (!target) return
        event.preventDefault()
        switchModule(target)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, saveModule, switchModule])
}
