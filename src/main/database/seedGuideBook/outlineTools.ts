import { seedBulletList, seedHeading, seedOutlineDoc, seedParagraph } from '../seedBlocks'
import type { SeedOutlineGroup } from './outline'

/**
 * 教学书大纲域 · 伏笔与灵感 + AI 助手 + 界面与设置（16 条）。
 *
 * 大纲条目是功能速查：只讲规则与边界，流程细节见同书章节正文。
 * 维护约定见 `./outline.ts` 与 AGENTS §7.5。
 */
export const OUTLINE_TOOLS_GROUPS: readonly SeedOutlineGroup[] = [
  {
    group: '伏笔与灵感',
    entries: [
      {
        title: '伏笔的三种建立方式',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('伏笔可以从三个入口建立，差别在有没有现成选区。'),
          seedBulletList([
            '标题栏「新建伏笔」：不带锚点，建成未锚定伏笔，之后可补埋点。',
            '正文或大纲条目选中文字 → 右键「添加伏笔」：一次完成埋点与建条。',
            '选中文字 → 右键「关联伏笔」：挂到已有伏笔上，候选只列当前槽位为空的。',
            '一条伏笔最多一个正文埋点、一个大纲埋点、一个回收位置。'
          ])
        ])
      },
      {
        title: '伏笔状态是算出来的',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('伏笔没有状态下拉，四种状态全部由锚点与废弃标记派生。'),
          seedBulletList([
            '判断优先级从高到低：已回收 → 已废弃 → 埋设中 → 建设中。',
            '不能手动改状态；只能通过增删锚点、废弃或恢复间接改变。',
            '锚点失效：目标章或条目被删、位置快照丢失时显示「锚点失效」，伏笔本身不会消失。'
          ])
        ])
      },
      {
        title: '回收伏笔与三处锚点',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '回收只发生在章节正文，是「伏笔在正文里兑现」的事件；大纲是规划层，没有回收入口。'
          ),
          seedBulletList([
            '在章节正文选中兑现文字 → 右键「回收伏笔」，可填回收备注。',
            '全书没有「埋设中」的伏笔时菜单项置灰；没有埋点的伏笔不在候选里。',
            '已回收的伏笔必须先移除回收位置，才能移除两个埋点；已回收也不能废弃。',
            '移除锚点不可撤销，位置快照与摘抄会一起清掉。'
          ])
        ])
      },
      {
        title: '灵感：随手记与标签',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('灵感是轻量速记，只有标题、正文与标签，没有锚点与状态。'),
          seedBulletList([
            '新建是即时的：点标题栏加号直接生成空白灵感并选中，没有弹窗。',
            '标签最多 20 个，单个不超过 40 字；回车或逗号添加，重复会被忽略。',
            '6 个预置标签：点子 / 场景 / 台词 / 人物 / 设定 / 待办。',
            '正文是块级富文本：标题、列表、引用、代码块、链接、分隔线、表格、高亮、字色、行内图片都能用；正文聚焦时标题栏换成格式工具栏，卡片摘要只取纯文本（列表、表格压平成文字）；删除是永久删除，没有回收站。'
          ])
        ])
      }
    ]
  },
  {
    group: 'AI 助手',
    entries: [
      {
        title: 'AI 的配置与密钥',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            'AI 助手的总开关在「设置 → AI 助手」，默认开启；关闭只影响章节右栏的 AI 页签。'
          ),
          seedBulletList([
            '服务商两选：DeepSeek（默认）与 OpenCode Go；两家的模型各记各的。',
            'Base URL 留空即恢复默认；密钥保存后只显示掩码，忘了只能清除重填。',
            '模型目录可手动刷新；离线时继续用内置基线，不影响发消息。'
          ])
        ])
      },
      {
        title: '会话属于书，不属于章',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '一本书共用一份会话列表，切章不会换会话；打开 AI 页签默认回到最近活跃的那条。'
          ),
          seedBulletList([
            '新建会话在发送第一条消息时才落库，之前只是「新对话」草稿。',
            '首轮回复完成后自动生成 6–14 字标题；手动改过的名字不会被覆盖。',
            '删除会话会连同消息一并删除，不可恢复；生成过程中会话操作禁用。'
          ])
        ])
      },
      {
        title: '五种功能与对应按钮',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '功能决定这一轮怎么加工文字，也决定回复上出现哪个回插按钮；不点回插就不会改正文。'
          ),
          seedBulletList([
            '润色 / 改写 / 翻译：只给「替换选中」。',
            '续写：只给「插入正文」；自由对话两个都给。',
            '历史消息只有「插入正文」，没有「替换选中」。',
            '功能在发送时定死，发送后不能临时切换。'
          ])
        ])
      },
      {
        title: '携带上下文的三选',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('输入框上方三个开关决定这一轮带什么：选中文本、全文、内置提示词。'),
          seedBulletList([
            '携带选中文本默认开启；携带全文与它互斥，勾一个另一个自动取消。',
            '携带内置提示词默认开启，只并入系统提示，不出现在对话气泡里。',
            '编辑器失焦时，正文用饰带标出待携带的选区；关掉开关饰带消失。',
            '三项可以全关，那就是纯对话，仍然能发送。'
          ])
        ])
      },
      {
        title: '上下文占用与超预算',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '占用 = 未压缩历史 + 已存摘要 + 输入草稿 + 这一轮携带的正文，四项合计除以模型窗口。'
          ),
          seedBulletList([
            '达到 80% 转警示色，达到 100% 转危险色并带警告图标。',
            '达到 80% 时发送前会先自动压缩较早对话（可在设置关闭）。',
            '超出窗口会拒绝发送，但输入原样保留；去掉携带内容或精简草稿再发即可。'
          ])
        ])
      },
      {
        title: '跨章回复与上下文快照',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('每轮对话记录来源章；来自其它章的回复会标出具体卷章，点一下即可跳回。'),
          seedBulletList([
            '来源章已删除时显示「已删除的章节」，不可点击。',
            '历史气泡显示「携带全章 · N 字」或「携带选区 · N 字」，悬停可看前 200 字片段。',
            '快照只存类型、字数与片段，不存全文；旧消息没有快照时整行不显示。'
          ])
        ])
      }
    ]
  },
  {
    group: '界面与设置',
    entries: [
      {
        title: '三栏宽度与右栏开关',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '左栏 180–480（默认 300），右栏 450–850（默认 600）；拖宽后立即生效并持久化。'
          ),
          seedBulletList([
            '五个设定域、伏笔、灵感没有左栏；切过去左栏自动收起。',
            '标题栏右栏按钮可开可关，偏好记住；窗口过窄时右栏强制隐藏且按钮禁用。',
            '在设定域、伏笔、灵感里点选卡片会自动展开右栏。'
          ])
        ])
      },
      {
        title: '排版五组设置',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '状态栏的排版按钮管五组：字体 7 档、行距 6 档、字距 5 档、页宽 4 档、缩放 9 档（80%–200%）。'
          ),
          seedBulletList([
            '页宽只在章节与大纲显示；剧情与五个设定域没有这一项。',
            '设置对所有书生效，不按书区分。',
            '改完立即作用到正文，没有额外保存按钮。'
          ])
        ])
      },
      {
        title: '主题与窗口材质不是一回事',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('主题决定配色，材质决定窗口背后是否透出桌面；两者各改各的，不会互相带动。'),
          seedBulletList([
            '主题五档：跟随系统 / 亮色 / 暗色 / 浅绿 / 浅黄；浅绿与浅黄只染章节与大纲的中栏。',
            '材质三档：亚克力 / 云母 / 关闭；亚克力更透，云母偏实色。',
            '材质需要 Windows 11 22H2 及以上，不支持时整项禁用。'
          ])
        ])
      },
      {
        title: '本地备份与云端备份',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('本地备份与云备份是两条链路，都只能手动创建，应用不会自动备份。'),
          seedBulletList([
            '本地：立即备份、重命名、恢复、删除、从文件恢复、导出；每份是文件夹（快照 + 元信息）。',
            '每次恢复前自动生成一份「恢复前安全副本」，恢复会整库覆盖并自动重启。',
            '云端目前只有 OneDrive：可上传、看列表、恢复与删除；每份是单个 .db 文件。'
          ])
        ])
      },
      {
        title: '重置为默认只覆盖五项',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('设置底栏的「重置为默认」只把五项界面偏好写回默认值，不是清空数据。'),
          seedBulletList([
            '五项：界面语言 / 自动保存 / 默认打开视图 / 主题 / 稿纸横线。',
            '不动笔名、排版、栏宽、窗口尺寸、窗口材质、AI 配置、OneDrive 登录、书籍数据与备份文件。',
            '重置后四项立即生效，默认打开视图要下次启动才体现。'
          ])
        ])
      },
      {
        title: '快捷键速查表',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('先记全局的保存、查找与模块切换，再记编辑器格式键。'),
          seedBulletList([
            'Ctrl+S 保存当前模块；Ctrl+F 只在章节与大纲打开查找替换。',
            'Ctrl+1–9 切前九个模块；伏笔与灵感没有数字键。',
            'Ctrl+B / I / U 加粗 / 斜体 / 下划线，Ctrl+Shift+S 删除线，Ctrl+E 行内代码，Ctrl+Z 撤销、Ctrl+Shift+Z 重做。',
            'Enter 提交或选中，Shift+Enter 在 AI 输入框换行；Tab / Shift+Tab 在弹窗内循环焦点，Esc 关闭浮层或取消改名。',
            '章节正文没有格式工具栏，这组格式键只能靠快捷键。'
          ])
        ])
      }
    ]
  }
]
