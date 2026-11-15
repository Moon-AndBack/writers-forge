import type { SeedVolume } from '../seedBlocks'
import { seedBulletList, seedParagraph, seedRichParagraph } from '../seedBlocks'

/**
 * 卷十「设置与快捷键」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 覆盖五章：设置弹窗总览 / 基础偏好 / 重置为默认 / 快捷键速查 / 全局交互与无障碍。
 * 设置导航以 `SettingsDialog` 与 `SettingsNav` 为准，共五项（基础偏好 / 外观与主题 /
 * AI 助手 / 本地备份 / 云备份）；「重置为默认」只覆盖 `RESETTABLE_SETTINGS` 的五项。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_SETTINGS: SeedVolume = {
  kind: 'normal',
  title: '设置与快捷键',
  chapters: [
    {
      title: '设置弹窗总览',
      paragraphs: [
        seedParagraph(
          '这一章先建立整体印象：设置从哪里打开、弹窗怎么分区、改动什么时候生效，以及为什么有些时候齿轮点不动。'
        ),
        seedRichParagraph([{ text: '入口与可用条件', bold: true }]),
        seedParagraph(
          '入口在标题栏右上角的齿轮。弹窗打开后同一个按钮变成 ×，再点一次即可关闭；也可以从底栏或按 Esc 退出。'
        ),
        seedBulletList([
          '首次启动的欢迎页还没填笔名时，齿轮是禁用的：先在欢迎页完成引导',
          '弹窗打开期间，背后的书架或写作页不可点击、不可聚焦，必须先关掉弹窗',
          'Esc 关闭设置；底栏右侧的「关闭」与标题栏的 × 效果相同',
          '第一次打开停在「基础偏好」；之后会停在上次浏览的分区'
        ]),
        seedRichParagraph([{ text: '两栏布局与五个分区', bold: true }]),
        seedParagraph(
          '弹窗左侧是固定宽度的导航，右侧是内容区。导航共五项，顺序固定：基础偏好、外观与主题、AI 助手、本地备份、云备份。'
        ),
        seedBulletList([
          '基础偏好：笔名、界面语言、自动保存、默认打开视图',
          '外观与主题：主题模式、窗口材质、稿纸横线',
          'AI 助手：服务商、接口地址、API Key、模型与启用开关',
          '本地备份：立即备份、备份列表、导出与恢复',
          '云备份：备份服务商、OneDrive 登录与云端备份列表'
        ]),
        seedRichParagraph([{ text: '切页不会丢草稿', bold: true }]),
        seedParagraph(
          '五个分区全部常驻渲染，切页只是换显示，不会卸载。因此 AI 草稿、API Key 输入、测试结果、压缩窗口输入、备份列表与 OneDrive 登录态都会原样保留。'
        ),
        seedRichParagraph([{ text: '固定尺寸与滚动', bold: true }]),
        seedParagraph(
          '弹窗宽度固定为 880px；高度在窗口足够时固定为 680px，窗口不够时按视口收缩。内容超出时只滚动右侧内容区，左侧导航与底栏不动；切换分区后内容区回到顶部。'
        ),
        seedRichParagraph([{ text: '改动即时生效', bold: true }]),
        seedParagraph(
          '设置没有「保存」按钮：改动一经操作就写入本地设置并立即生效。底栏左侧是「重置为默认」，右侧是「关闭」；弹窗打开时 Tab 与 Shift+Tab 只在弹窗内循环。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '笔名等文本输入要点走焦点或按 Enter 才提交，直接关窗会丢掉未提交的输入',
          '弹窗高度固定，看不到的选项请在右侧内容区滚动，不要以为设置项缺失',
          '弹窗打开时 Ctrl+F 与 Ctrl+1 到 Ctrl+9 让位，Ctrl+S 仍然可以保存当前模块',
          '设置写入本地数据库，不联网；卸载或换机不会自动带走这些偏好'
        ])
      ]
    },
    {
      title: '基础偏好',
      paragraphs: [
        seedParagraph(
          '这一章讲「设置 → 基础偏好」的四项：笔名、界面语言、自动保存与默认打开视图。它们都即时生效，没有保存按钮。'
        ),
        seedRichParagraph([{ text: '笔名', bold: true }]),
        seedParagraph(
          '第一行是「笔名」，用于书籍卡的作者署名。输入后按 Enter 或让输入框失焦提交，提交时会去掉首尾空白。'
        ),
        seedBulletList([
          '不能只包含空白：全空白会提示「笔名不能只包含空白」，且不写库',
          '最多 40 个字：超出会提示上限并拒绝保存（欢迎页的 64 字硬上限不适用于这里）',
          '留空并提交表示清空笔名，书籍卡作者行改为显示「未署名」',
          '笔名是全局署名，不按书单独设置'
        ]),
        seedRichParagraph([{ text: '界面语言', bold: true }]),
        seedParagraph(
          '「界面语言」只有两档：简体中文与 English。选中即切换，整个界面（按钮、提示、空态）立刻换语言，并写入设置，下次启动保持。'
        ),
        seedParagraph(
          '语言的默认值按首次启动时的系统语言解析：中文系统用简体中文，其它情况回退简体中文。重置为默认时会重新按当前系统语言解析，而不是固定成某一档。'
        ),
        seedRichParagraph([{ text: '自动保存', bold: true }]),
        seedParagraph(
          '「自动保存」是开关，默认开启。开启时，章节与大纲正文停止输入约 800ms 后自动落库；关闭后不再自动保存，需要点各模块的「保存」按钮。'
        ),
        seedBulletList([
          '关闭自动保存只影响「停笔自动落库」，不会让编辑变得不安全',
          '切换章节、切换模块、关闭窗口时仍会强制保存一次，避免草稿丢失',
          '剧情、设定档案、伏笔、灵感本来就是手动保存，不受这个开关影响',
          '自动保存开关本身立即写库，不需要再点保存'
        ]),
        seedRichParagraph([{ text: '默认打开视图', bold: true }]),
        seedParagraph(
          '「默认打开视图」有三档：书架（默认）、章节编辑、大纲视图。它决定下次启动落在哪里，而不是当次点击后立刻跳转。'
        ),
        seedBulletList([
          '书架：启动停在书架，这是唯一不自动打开书的档位',
          '章节编辑：启动打开最近编辑的那本书，并直接进入章节模块',
          '大纲视图：启动打开最近编辑的那本书，并直接进入大纲模块',
          '「最近编辑」按书的最后编辑时间取第一本，不是上次手动打开的书',
          '改完只影响下次启动；当次仍停在设置弹窗，关掉后也不会跳转'
        ]),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '笔名提交失败时输入框会标红，改到合法后提示自动消失；失败期间不会覆盖已保存的笔名',
          '语言切换后本页文案也会立刻变成新语言，这是正常现象',
          '关掉自动保存后不要依赖切换章节兜底，重要段落先手动保存',
          '默认视图选中「章节编辑 / 大纲视图」后，如果一本书都没有，启动仍会回到书架'
        ])
      ]
    },
    {
      title: '重置为默认',
      paragraphs: [
        seedParagraph(
          '这一章讲「重置为默认」到底会改什么、不会改什么，以及为什么它不是「清空数据」。'
        ),
        seedRichParagraph([{ text: '入口与确认', bold: true }]),
        seedParagraph(
          '设置弹窗底栏左侧是「重置为默认」，危险操作样式。点击后先弹确认框，说明将被重置的五项；确认后才执行，完成后提示「已重置为默认设置」。'
        ),
        seedBulletList([
          '取消确认不会改任何设置',
          '重置不可撤销：恢复旧值只能逐项手动改回',
          '重置不创建备份，也不会删除任何备份文件'
        ]),
        seedRichParagraph([{ text: '只重置五项', bold: true }]),
        seedBulletList([
          '界面语言：跟随系统（按当前系统语言落到简体中文或 English）',
          '自动保存：开',
          '默认打开视图：书架',
          '主题模式：跟随系统',
          '稿纸横线：关'
        ]),
        seedParagraph(
          '主题回「跟随系统」不等于换成浅色；语言下拉只有两档，重置后显示的是按系统解析出的具体档位，而不是多出一个「跟随系统」选项。'
        ),
        seedRichParagraph([{ text: '不会重置什么', bold: true }]),
        seedBulletList([
          '笔名，以及排版（字体 / 行距 / 字距 / 页宽 / 缩放）',
          '左右栏宽度、右栏显隐、活动栏固定态、窗口尺寸与窗口材质',
          'AI 配置与 API Key、OneDrive 登录态',
          '所有书籍、章节、大纲、实体、伏笔与备份文件'
        ]),
        seedRichParagraph([{ text: '生效时机', bold: true }]),
        seedParagraph(
          '语言、自动保存、主题、稿纸横线四项立即生效；默认打开视图要等到下次启动才体现。重置只是把设置项写回默认值，不是删除设置项，所以 AI 与 OneDrive 的登录不会被顺带清掉。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '「重置为默认」不碰书籍与备份：想清空数据请走各模块的删除入口或备份恢复',
          '重置不会退出 AI 与 OneDrive 登录，也不会删除密钥',
          '重置后界面语言可能立刻变化，继续操作前先看清当前语言',
          '默认视图重置为书架后，下次启动才会回到书架'
        ])
      ]
    },
    {
      title: '快捷键速查',
      paragraphs: [
        seedParagraph(
          '这一章按使用场景汇总快捷键。先记全局的保存、查找与模块切换，再记编辑器里的格式键。'
        ),
        seedRichParagraph([{ text: '全局', bold: true }]),
        seedBulletList([
          'Ctrl+S：保存当前模块；弹窗打开时也生效',
          'Ctrl+F：打开当前模块的查找替换，仅章节与大纲响应；弹窗打开时让位',
          'Ctrl+1 到 Ctrl+9：切换到活动栏第 N 个模块（1 章节、2 大纲、3 剧情、4 世界观、5 角色、6 势力、7 境界体系、8 物品功法、9 时间线）',
          'Esc：关闭弹窗 / 搜索浮窗 / 右键菜单 / 主题面板 / 状态栏弹层；取消内联改名；收起悬浮活动栏',
          'Tab 与 Shift+Tab：在弹窗内循环焦点',
          'Enter 或空格：选中卡片、卷行、分组、章节',
          'macOS 上把 Ctrl 换成 Cmd，其余键位对应不变'
        ]),
        seedRichParagraph([{ text: '编辑器通用', bold: true }]),
        seedBulletList([
          'Ctrl+B 加粗 / Ctrl+I 斜体 / Ctrl+U 下划线',
          'Ctrl+Shift+S 删除线 / Ctrl+E 行内代码',
          'Ctrl+Z 撤销 / Ctrl+Shift+Z 重做',
          '章节正文、大纲正文、剧情正文与设定正文都支持这组格式键',
          '章节正文没有格式工具栏，只能靠快捷键；其余三处同时提供标题栏工具栏'
        ]),
        seedRichParagraph([{ text: '列表、表格与输入框', bold: true }]),
        seedBulletList([
          '大纲表格内：Tab 到下一单元格，Shift+Tab 回上一单元格',
          '内联改名（卷、分组、时间线、备份名）：Enter 提交，Esc 取消',
          'AI 面板输入框：Enter 发送，Shift+Enter 换行',
          '对话框：Esc 关闭当前层；可提交的单行输入框内按 Enter 提交该字段'
        ]),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          'Ctrl+F 只在章节与大纲有效，其它模块按了不会出现查找框',
          '弹窗打开时 Ctrl+F 与 Ctrl+1..9 让位，Ctrl+S 仍然保存后台模块',
          'Ctrl+1..9 最多到第 9 个模块；伏笔与灵感没有数字键，只能点活动栏',
          'Ctrl+E 是行内代码，不是「打开」；不要和系统快捷键混淆',
          '格式键只在可编辑正文里有效，只读详情与输入框里不生效'
        ])
      ]
    },
    {
      title: '全局交互与无障碍',
      paragraphs: [
        seedParagraph(
          '这一章讲全应用一致的交互约定：弹窗怎么关、浮层怎么收起、数据没读出来时看到什么，以及只用键盘能不能走完。'
        ),
        seedRichParagraph([{ text: '对话框与焦点', bold: true }]),
        seedBulletList([
          'Esc 只关闭最上面那一层，多层弹窗不会一次全关',
          'Tab 与 Shift+Tab 在弹窗内循环，焦点不会跑到背后的页面',
          '弹窗打开时背景不可点击、不可聚焦，必须先处理弹窗',
          '关闭后焦点回到打开它的按钮；嵌套弹窗先回到外层弹窗'
        ]),
        seedRichParagraph([{ text: '悬停浮层与右键菜单', bold: true }]),
        seedBulletList([
          '悬停约 260ms 后显示，移出约 120ms 后隐藏',
          '右键菜单只在可编辑正文里出现，只读区域不弹',
          '右键菜单在 Esc、点外部、滚动、窗口尺寸变化、窗口失焦时都会关闭'
        ]),
        seedRichParagraph([{ text: '加载、空态与错误', bold: true }]),
        seedParagraph(
          '所有列表的判定顺序固定为「加载中 → 出错 → 空 → 内容」。已有数据时读取出错不会清空已显示内容，而是在行内提示并给出重试。'
        ),
        seedBulletList([
          '空态说「还没有内容」，并给新建入口',
          '错误态说「读取失败」，并给重试按钮',
          '两者不能互相冒充：读取失败时不要以为是没有数据',
          '重试只重读当前列表，不会重载整页'
        ]),
        seedRichParagraph([{ text: '键盘可达与崩溃兜底', bold: true }]),
        seedBulletList([
          '卡片、卷行、分组行、章节行都支持 Enter 与空格选中',
          '弹窗内所有控件都能用 Tab 到达，焦点有可见描边',
          '界面某处出错时显示错误页：错误摘要、复制详情、重新加载',
          '切换页面会自动复位错误页；数据自检在启动时进行，有问题才弹窗列出，没问题不打扰'
        ]),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '自检弹窗关闭后不会记住「已忽略」，下次启动仍会提示',
          '错误页的「重新加载」会重载整个界面，未保存的草稿带不回来',
          'Esc 在输入法组字或已有更上层弹窗时可能不动作，这是让位而不是失灵',
          '阅读只读详情时不要期待右键菜单或格式快捷键生效'
        ])
      ]
    }
  ]
}
