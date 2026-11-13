import { useState } from 'react'
import {
  Button,
  Dropdown,
  Modal,
  useToast,
  useTooltip,
  Window,
  type DropdownItem,
  type TooltipPlacement
} from '@renderer/components/ui'
import { Demo, Sample } from '../Section'

function TooltipSample({ placement }: { placement: TooltipPlacement }) {
  const { anchorRef, anchorProps, tooltip } = useTooltip<HTMLButtonElement>({
    content: `Tooltip · ${placement}`,
    placement
  })

  return (
    <>
      {tooltip}
      <button ref={anchorRef} {...anchorProps} type="button" className="wf-btn wf-btn--secondary">
        悬停 / 聚焦（{placement}）
      </button>
    </>
  )
}

const DROPDOWN_SAMPLE_ITEMS: DropdownItem[] = [
  { key: 'new', label: '新建章节' },
  { key: 'rename', label: '重命名', checked: true },
  { key: 'duplicate', label: '创建副本' },
  { key: 'sep', separator: true },
  { key: 'delete', label: '删除（无权限）', disabled: true }
]

const WINDOW_SIZES = [
  { size: 'sm', width: 360 },
  { size: 'md', width: 480 },
  { size: 'lg', width: 640 },
  { size: 'xl', width: 880 }
] as const

/** 浮层分区：Dropdown / Window / Modal / Toast / Tooltip；Splitter 因 CSS 属写作域而跳过。 */
export function OverlaysSection() {
  const [dropdownPick, setDropdownPick] = useState('未选择')
  const [modalOpen, setModalOpen] = useState(false)
  const toast = useToast()

  const dropdownItems: DropdownItem[] = DROPDOWN_SAMPLE_ITEMS.map((item) => ({
    ...item,
    onSelect: item.separator || item.disabled ? undefined : () => setDropdownPick(item.key)
  }))

  return (
    <>
      <Demo
        name="Dropdown · default / checked / separator / disabled"
        note="点击触发器展开；支持 ↑↓ / Home / End / Enter / Esc 键盘导航，点击外部关闭。"
        classes="wf-dropdown / wf-dropdown__menu / wf-dropdown__item / wf-dropdown__sep"
      >
        <div className="sg-row">
          <Dropdown
            trigger={<Button variant="secondary">章节操作 ▾</Button>}
            items={dropdownItems}
          />
          <Dropdown
            align="end"
            trigger={<Button variant="ghost">右对齐菜单</Button>}
            items={[
              { key: 'a', label: '导出 Markdown' },
              { key: 'b', label: '导出纯文本' },
              { key: 'c', label: '打印', disabled: true }
            ]}
          />
          <Dropdown
            disabled
            trigger={
              <Button variant="secondary" disabled>
                禁用触发器
              </Button>
            }
            items={[{ key: 'none', label: '不可达' }]}
          />
          <span className="sg-label">
            当前选择：<code className="sg-code">{dropdownPick}</code>
          </span>
        </div>
      </Demo>

      <Demo
        name="Window · sm 360 / md 480 / lg 640 / xl 880"
        note="静态展示（非 portal）：面板宽度取 max-width，容器不足时自适应收缩。"
        classes="wf-window / wf-window--{size} / wf-window__head / __body / __footer"
      >
        <div className="sg-window-list">
          {WINDOW_SIZES.map((item) => (
            <Sample key={item.size} label={`${item.size} · 最大宽度 ${item.width}px`}>
              <Window
                size={item.size}
                title={`Window · ${item.size}`}
                onClose={() => undefined}
                footer={
                  <>
                    <span className="sg-label">底部操作区（左右渐隐分隔线）</span>
                    <Button variant="secondary" size="sm">
                      关闭
                    </Button>
                  </>
                }
              >
                <p>窗口框架：标题区 + 可滚动内容区 + 底部操作区，被 Modal 与欢迎页共用。</p>
              </Window>
            </Sample>
          ))}
        </div>
      </Demo>

      <Demo
        name="Modal · 真实弹窗（点击打开）"
        note="Modal = 遮罩 + Window；打开时锁 body 滚动、焦点 trap、Esc 关闭、退场动画后卸载。"
        classes="wf-modal / wf-modal__mask / wf-modal__panel"
      >
        <div className="sg-row">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            打开 Modal
          </Button>
          <span className="sg-label">建议同时切换主题，观察遮罩与面板在四套主题下的表现。</span>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="示例弹窗"
          size="md"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                取消
              </Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>
                确认
              </Button>
            </>
          }
        >
          <p>这是真实挂载到 document.body 的 Modal，可检查 Esc、遮罩点击与 Tab 焦点循环。</p>
          <p>面板内按钮最小宽度 104px，底栏两端分布。</p>
        </Modal>
      </Demo>

      <Demo
        name="Toast · useToast() 命令式提示"
        note="hook 形态：show(message) 触发，node 挂到组件树；2.6s 后淡出，仅用 opacity。"
        classes="wf-toast / is-leaving"
      >
        <div className="sg-row">
          <Button variant="secondary" onClick={() => toast.show('已保存到本地')}>
            显示 Toast
          </Button>
          <span className="sg-label">Toast portal 到 body，页面底部居中。</span>
        </div>
        {toast.node}
      </Demo>

      <Demo
        name="Tooltip · useTooltip() 自绘浮层"
        note="默认延迟 350ms 显示；按视口空间自动避让，四个首选方向都试一遍。"
        classes="wf-tooltip / is-ready"
      >
        <div className="sg-row">
          {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
            <TooltipSample key={placement} placement={placement} />
          ))}
        </div>
      </Demo>

      <Demo
        name="Splitter · 本页跳过"
        note="Splitter 组件自身不 import 任何 CSS，其 .splitter 规则位于 styles/writer.css（写作页三栏布局域）。引入该文件会把整套写作布局样式带进展厅，故不在本页展示；如需查看请在写作页拖动分栏。"
        classes="splitter / splitter-left / splitter-right / splitter-horizontal"
      >
        <span className="sg-label">
          原因记录于 README「为什么没有 Splitter」。组件行为（拖拽 / 方向键 / 双击复位）由
          useSplitter 提供，样式随写作域加载。
        </span>
      </Demo>
    </>
  )
}

export default OverlaysSection
