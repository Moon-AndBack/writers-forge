import type { SeedVolume } from '../seedBlocks'
import { seedBulletList, seedParagraph, seedRichParagraph } from '../seedBlocks'

/**
 * 卷七「AI 助手」章节域载体（独立文件，§3 单文件 ≤500 行）。
 *
 * 覆盖 AI 页签的八件事：开启与配置、会话管理、五种写作功能、携带上下文、
 * 发送与上下文占用、消息与回插正文、跨章来源与上下文快照、压缩与关闭 AI。
 * 章节页只渲染纯段落：小节标题用加粗段落（`seedRichParagraph`），要点用
 * `seedBulletList`（降级为「• 」前缀），不用 `seedHeading`。
 *
 * 教学数据维护约定见 `volumes.ts` 文件头（AGENTS §7.5）。
 */
export const VOLUME_AI: SeedVolume = {
  kind: 'normal',
  title: 'AI 助手',
  chapters: [
    {
      title: '开启与配置',
      paragraphs: [
        seedParagraph(
          '这一章讲 AI 助手怎么打开、怎么配：总开关在哪儿、两家服务商怎么选、密钥存在哪，以及模型目录与「测试连接」各验证什么。'
        ),
        seedRichParagraph([{ text: '入口与总开关', bold: true }]),
        seedParagraph(
          '标题栏右侧的齿轮按钮打开设置，切到「AI 助手」页。第一行是「启用 AI 助手」，默认开启：打开后章节右栏多出 AI 页签，写作时随手可用。'
        ),
        seedParagraph(
          '关掉之后只影响章节右栏的 AI 页签——页签消失，右栏剩四个；配置、密钥与全部会话都原样保留，重新打开即恢复。'
        ),
        seedRichParagraph([{ text: '服务商与 Base URL', bold: true }]),
        seedBulletList([
          '服务商两选：DeepSeek（默认）与 OpenCode Go',
          'Base URL 失焦即保存；留空则恢复默认地址',
          '填过自定义地址后想回去，清空输入框再让它失焦即可'
        ]),
        seedRichParagraph([{ text: 'API Key', bold: true }]),
        seedParagraph(
          '密钥是密码框，右侧是「保存」与「清除」两个按钮。保存之后输入框只显示掩码，界面不再回显明文；要换就重填再保存，要删就点「清除」。'
        ),
        seedBulletList([
          'DeepSeek 用平台签发的 API Key',
          'OpenCode Go 要填以 oc_sk_ 开头的 Personal API Key，格式不对会被拒绝',
          '密钥只写进本机加密存储，不进设置备份以外的任何地方'
        ]),
        seedParagraph(
          '系统安全存储不可用时，密钥输入框会禁用并给出提示。这是保护措施而不是界面故障，先修好系统凭据服务再回来填。'
        ),
        seedRichParagraph([{ text: '模型目录与测试连接', bold: true }]),
        seedBulletList([
          '模型目录显示当前条数、更新时间以及是否已过期',
          '「刷新模型目录」会联网拉取；离线时继续用内置基线，不影响发消息',
          '「测试连接」会拉取一次模型列表来验证：成功显示延迟，失败给出原因'
        ]),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '总开关默认开启；关掉只影响 AI 页签，配置与会话不会丢',
          'Base URL 清空后失焦即恢复默认，不必手填官方地址',
          '密钥保存后不回显明文，忘了只能清除重填',
          '测试连接成功只说明地址与密钥可用，不代表每次提问都成功'
        ])
      ]
    },
    {
      title: '会话管理',
      paragraphs: [
        seedParagraph(
          '这一章讲 AI 页签顶部的会话栏：一条对话怎么开始、名字从哪来、删掉之后去哪，以及它为什么跟着书走而不是跟着章走。'
        ),
        seedRichParagraph([{ text: '会话栏与「新对话」', bold: true }]),
        seedParagraph(
          'AI 页签顶部是会话栏：左边是当前会话下拉，右边是「⋯」菜单与新建按钮。还没发过消息时会话名显示为草稿态的「新对话」——此时它还没有落库，发送第一条消息才真正保存。'
        ),
        seedBulletList([
          '新建：点新建按钮，面板清空成一条「新对话」',
          '切换：点下拉选另一条会话，历史随之载入',
          '重命名与删除：都收在「⋯」菜单里'
        ]),
        seedRichParagraph([{ text: '会话属于书，不属于章', bold: true }]),
        seedParagraph(
          '一本书的所有章节共用同一份会话列表，切章不会换会话。打开 AI 页签时默认载入这本书最近活跃的那条会话。'
        ),
        seedParagraph(
          '所以一条会话里会同时留下来自不同章节的提问；每条回复当时来自哪一章，会单独标在气泡上（见「跨章来源与上下文快照」一章）。'
        ),
        seedRichParagraph([{ text: '重命名与删除', bold: true }]),
        seedBulletList([
          '重命名：改完按 Enter 提交',
          '中文输入法组字过程中按 Enter 只确认候选词，不会误提交',
          '删除：要过一次二次确认，确认后该会话与消息一并删除',
          '生成过程中所有会话操作都是禁用态，等这一轮结束再动'
        ]),
        seedRichParagraph([{ text: '自动命名', bold: true }]),
        seedBulletList([
          '新建会话的首轮回复完成后，AI 会生成一个 6–14 字的标题',
          '只在标题为空时写入，你手动改过的名字不会被覆盖',
          '生成失败时回落到用第一条消息截断成标题'
        ]),
        seedRichParagraph([{ text: '切换会话与保留消息', bold: true }]),
        seedParagraph(
          '切换会话会载入该会话的历史消息。切走 AI 页签再切回来，消息仍然在——不会像早先那样被清空，也不需要重新提问。'
        ),
        seedParagraph(
          '重启应用后会回到上次打开的那一章，而不是第一章；会话按书归属，上次的对话照旧留在列表里。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '「新对话」是草稿：不发送消息就不会出现在会话下拉里',
          '会话按书归属，切章不换会话，也不会把一条会话拆成两半',
          '手动改过名字的会话不再被自动命名覆盖',
          '删除会话不可恢复，删前确认里面没有还要用的内容'
        ])
      ]
    },
    {
      title: '五种写作功能',
      paragraphs: [
        seedParagraph(
          '这一章讲功能下拉里的五项各做什么、选完之后能对正文做什么，以及模型下拉记住的是什么。'
        ),
        seedRichParagraph([{ text: '功能五选', bold: true }]),
        seedBulletList([
          '润色：不改原意，把文字改得更通顺',
          '续写：接着你给的文字往下写',
          '改写：按你写的指令重写这段内容',
          '翻译：翻译成你指定的目标语言',
          '自由对话：不做特定加工，问什么答什么'
        ]),
        seedParagraph(
          '功能是这一轮对话的意图说明：它决定 AI 怎么加工你的文字，也决定回复上会出现哪个回插按钮；只要不点回插，正文不会被改动。'
        ),
        seedRichParagraph([{ text: '功能决定回插按钮', bold: true }]),
        seedParagraph('回复气泡上出现哪个回插按钮，由发送时选的功能决定，不能临时切换。'),
        seedBulletList([
          '润色 / 改写 / 翻译：只给「替换选中」',
          '续写：只给「插入正文」',
          '自由对话：两个都给'
        ]),
        seedRichParagraph([{ text: '模型下拉', bold: true }]),
        seedParagraph(
          '面板里的模型下拉就是全局当前模型：在这里换模型会写回设置，退出再打开仍是同一个。不同服务商各记各的，切回 DeepSeek 时不会沿用 OpenCode Go 的选择。'
        ),
        seedParagraph('切换模型若失败，下拉会回退到原来的模型并给出提示，不会停在半途。'),
        seedRichParagraph([{ text: '和右栏页签的关系', bold: true }]),
        seedParagraph(
          '这里是章节右栏的 AI 页签，不是独立窗口；关掉总开关后页签消失，功能与配置都还在。功能下拉只作用于当前这一轮，不会自己改动正文。'
        ),
        seedRichParagraph([{ text: '和携带上下文的区别', bold: true }]),
        seedParagraph(
          '功能与携带上下文是两件事：功能决定「怎么加工」，携带上下文决定「把哪些文字交给 AI」。一个在下拉里选，一个用开关勾，互不联动。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '功能决定可用的回插方式，发送之后不能改',
          '模型是全局设置，换一次会影响之后所有会话',
          '服务商各记一个模型，切换服务商时列表跟着换',
          '翻译要先在指令里写清目标语言，默认没有预设语种'
        ])
      ]
    },
    {
      title: '携带上下文',
      paragraphs: [
        seedParagraph(
          '这一章讲发消息时带什么给 AI：三个开关各管一件事、哪两个互斥、怎么在正文里确认选区，以及状态行上的携带字数。'
        ),
        seedRichParagraph([{ text: '三个开关', bold: true }]),
        seedParagraph(
          '三个开关都在 AI 页签的输入框上方，从上到下依次是选中文本、全文、内置提示词。'
        ),
        seedBulletList([
          '携带选中文本（默认开启）：带上你在正文里选中的那一段',
          '携带全文：带上整章正文',
          '携带内置提示词（默认开启）：把作品的频道与分类风格约束加进系统提示'
        ]),
        seedParagraph(
          '三项互不替代：选区或全文决定「带哪段正文」，内置提示词决定「额外加什么约束」，可以只开其中一项，也可以都不开。'
        ),
        seedRichParagraph([{ text: '两个开关互斥', bold: true }]),
        seedParagraph(
          '「携带选中文本」与「携带全文」互斥：勾上一个，另一个会自动取消。想让 AI 读整章就选全文，想只读一段就选选区，不存在两个同时生效的状态。'
        ),
        seedRichParagraph([{ text: '待携带的选区', bold: true }]),
        seedParagraph(
          '编辑器失焦时，正文里会用饰带标出「待携带的选区」，提醒你 AI 会看到哪一段。回到编辑器继续改动，饰带随之更新；把开关关掉，饰带不再出现。'
        ),
        seedRichParagraph([{ text: '内置提示词', bold: true }]),
        seedParagraph(
          '内置提示词可以展开查看全文，发出去之前就知道加了什么约束。书还没有设置分类时，这里只提示「使用基础提示词」，不会拼出一段空规则。'
        ),
        seedRichParagraph([{ text: '携带字数与纯对话', bold: true }]),
        seedParagraph(
          '携带多少字会显示在输入框下方的状态行里，发送前就能看到。三个开关全关也允许发送——那就是纯对话，AI 只看到你输入的问题。'
        ),
        seedParagraph(
          '携带的字数同时计入上下文占用，带了整章再写长草稿时，先瞄一眼状态行上的百分比。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '选区与全文只能选一个，勾一个另一个自动取消',
          '携带全文按整章计算，长章会明显推高上下文占用',
          '没有选中任何文字时打开选区开关不报错，只是没有内容可带',
          '内置提示词改的是系统提示，不会出现在对话气泡里',
          '什么都不带也能发，适合问与本书无关的问题'
        ])
      ]
    },
    {
      title: '发送、状态行与上下文占用',
      paragraphs: [
        seedParagraph(
          '这一章讲章节右栏 AI 页签里按下发送之后发生什么：键盘怎么用、生成中怎么停、状态行三个位置各显示什么，以及超出上下文预算时会怎样。'
        ),
        seedRichParagraph([{ text: '发送与换行', bold: true }]),
        seedBulletList([
          'Enter 发送；Shift+Enter 换行',
          '中文输入法组字时按 Enter 只确认候选词，不会误发送',
          '生成中发送按钮变成「停止」，点了会中止并保留已经生成的部分'
        ]),
        seedRichParagraph([{ text: '状态行三块信息', bold: true }]),
        seedBulletList([
          '携带字数：这一轮带了多少正文',
          '错误或超预算提示：发送失败、模型报错、超出窗口时在这里说原因',
          '上下文占用百分比：这一轮大约会用掉模型窗口的多少'
        ]),
        seedParagraph('占用到 80% 时百分比转为警示色；到 100% 转为危险色，并带一个警告图标。'),
        seedParagraph('状态行就在输入框正下方，发送前扫一眼，就知道这一轮重不重。'),
        seedRichParagraph([{ text: '占用怎么算', bold: true }]),
        seedParagraph(
          '占用由四部分组成：未压缩的历史消息、已经存下的摘要、你正在输入的草稿，以及这一轮要携带的正文。四项加起来除以模型窗口，才是状态行上的那个百分比。'
        ),
        seedParagraph('模型窗口按「服务商 + 模型」分别缓存，换模型后占用会按新窗口重新计算。'),
        seedRichParagraph([{ text: '超预算会被拒绝发送', bold: true }]),
        seedParagraph(
          '上下文超出模型窗口时，这一轮会被拒绝发送，但你的输入原样留在输入框里。去掉一些携带内容或精简草稿再发即可，不需要重打一遍。'
        ),
        seedRichParagraph([{ text: '和自动压缩的关系', bold: true }]),
        seedParagraph(
          '占用到 80% 时自动压缩会先介入（详见「压缩与关闭 AI」一章）：先把较早的对话压成摘要，再让这一轮发出去；压不下去才会走到超预算拒绝。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          'Enter 发送、Shift+Enter 换行；组字时 Enter 不发送',
          '「停止」之后已生成的部分会保留，不是全丢',
          '百分比是估算，换模型或改携带开关都会变',
          '到 100% 时先关掉「携带全文」，通常立刻就够用了',
          '拒绝发送不会清空输入，别急着重打'
        ])
      ]
    },
    {
      title: '消息与回插正文',
      paragraphs: [
        seedParagraph(
          '这一章讲 AI 页签对话区的两种气泡长什么样、出错与中断怎么标，以及两个回插按钮分别把文字放到正文的哪里。'
        ),
        seedRichParagraph([{ text: '用户气泡与助手气泡', bold: true }]),
        seedBulletList([
          '用户气泡：功能胶囊 + 你输入的正文，长文默认折叠 3 行，点开看全文',
          '用户气泡还带这一轮携带内容的预览，能确认带的是选区还是全章',
          '助手气泡支持 Markdown：表格、代码块、引用与链接都能正常显示',
          '流式输出时末尾有闪烁光标，输出结束即消失'
        ]),
        seedRichParagraph([{ text: '出错与中断', bold: true }]),
        seedParagraph(
          '请求失败时气泡里显示错误文案，说明是哪一步没成；被「停止」中止的那条会标上「已中断」，已经生成的内容照样留在气泡里。'
        ),
        seedRichParagraph([{ text: '「替换选中」', bold: true }]),
        seedParagraph(
          '它用发送那一刻的选区快照去替换正文：先找回当时的选区位置，再核对原文是否还对得上。位置或原文变了就不动手，提示你重新选中再试。'
        ),
        seedRichParagraph([{ text: '「插入正文」的落点', bold: true }]),
        seedBulletList([
          '携带全文时：插到整章正文的末尾',
          '有选区时：插到选区之后',
          '都没有时：插到当前光标处'
        ]),
        seedParagraph('两个按钮一句话区分：替换会改掉原来那段，插入只在落点新增，不动已有文字。'),
        seedRichParagraph([{ text: '历史消息只给「插入正文」', bold: true }]),
        seedParagraph(
          '重新打开应用或切到旧会话时，历史气泡上只有「插入正文」，没有「替换选中」——发送那一刻的选区早已失效，硬替换容易改错地方。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '回插只对同一章的消息可用，跨章请先跳到来源章',
          '「替换选中」对不上原文时会拒绝执行，先重新选中再来',
          '「插入正文」不覆盖已有内容，只在落点处新增',
          '历史消息没有「替换选中」，要替换就重新发一轮'
        ])
      ]
    },
    {
      title: '跨章来源与上下文快照',
      paragraphs: [
        seedParagraph(
          '这一章讲 AI 页签历史气泡上多出来的两行小字：它来自哪一章，以及发送那一刻究竟带了什么。'
        ),
        seedRichParagraph([{ text: '每轮都记来源', bold: true }]),
        seedParagraph(
          '每轮对话都会记录它来自哪一章。当回复来自别的章时，气泡上会显示具体位置，例如「卷一 风起 · 第三章 洪荒初现」，并且可以点击跳转。'
        ),
        seedBulletList([
          '点击来源会切到章节模块，并选中那一章',
          '跳转之后提示自动消失，因为当前章已经变了',
          '那一章已被删除时显示「已删除的章节」，不可点击',
          '讨论全书、没有绑定章节的消息不显示来源标注'
        ]),
        seedParagraph(
          '来源标注是逐条消息的属性，不写在会话上：同一会话里既有本章的提问，也可能有前几章的提问，各自标各自的。'
        ),
        seedRichParagraph([{ text: '上下文快照', bold: true }]),
        seedParagraph(
          '历史气泡还会显示这一轮当时带了什么，形如「携带全章 · 2,340 字」或「携带选区 · 128 字」；鼠标停在上面能看到前 200 字的片段。'
        ),
        seedBulletList([
          '只存类型与字数，不存全文，避免数据库越用越大',
          '旧消息没有快照时整行不显示，这不是错误',
          '快照记录发送那一刻的状态，之后改开关不会改写历史'
        ]),
        seedRichParagraph([{ text: '和会话归属的关系', bold: true }]),
        seedParagraph(
          '会话按书共用，所以一条会话里出现多个来源章是正常的。来源只回答「这条回复是在哪一章问的」，不改变会话属于整本书这件事。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '跨章回复不是不可用：它写明章节名，点一下就能过去',
          '来源章被删除后标注不可点，只能回正文里自己找',
          '没有来源标注不代表出错，那是全书层面的对话',
          '快照只有类型与字数，想看当时原文要去对应章节'
        ])
      ]
    },
    {
      title: '压缩与关闭 AI',
      paragraphs: [
        seedParagraph(
          '这一章讲上下文快满时怎么办、自定义窗口怎么填，以及关掉 AI 助手之后哪些东西会消失、哪些会留下。'
        ),
        seedRichParagraph([{ text: '自动压缩', bold: true }]),
        seedBulletList([
          '开关在「设置 → AI 助手」，默认开启',
          '发送前若占用达到窗口的 80%，会先把较早的对话压缩成摘要，目标压到 50%',
          '关闭后仍会省略较早对话，但不生成摘要——那一段不再回传给 AI'
        ]),
        seedParagraph(
          '摘要不删除任何消息：聊天记录里原文仍在，只是多出一条「已压缩 N 轮对话」的分隔，提醒你这几轮已经被概括过。'
        ),
        seedParagraph('压缩改的只是回传给 AI 的内容，你看到的聊天记录一字不动。'),
        seedRichParagraph([{ text: '自定义上下文窗口', bold: true }]),
        seedParagraph(
          '内置目录里没有的模型，可以手工填「模型 ID + tokens 数」，窗口范围 1024 到 10,000,000。添加后出现在列表里，可逐条删除。'
        ),
        seedParagraph(
          '窗口填的是模型真实上限，别为了多塞内容随手放大：填大了会频繁撞上超预算，填小了压缩会来得更早。'
        ),
        seedRichParagraph([{ text: '关闭 AI 助手之后', bold: true }]),
        seedBulletList([
          '章节右栏的 AI 页签消失，剩四个页签',
          '配置、密钥、全部会话与消息都保留，重新打开即恢复',
          '关闭时若正在生成，请求会中止，已生成的部分仍会保存'
        ]),
        seedParagraph(
          '关掉期间章节写作照常，只是右栏少一个页签；要用 AI 时回设置里重新打开，不需要重新配置。'
        ),
        seedRichParagraph([{ text: '注意', bold: true }]),
        seedBulletList([
          '自动压缩默认开启，关掉后不会再有新摘要',
          '摘要只是省上下文，不删消息，聊天记录照旧可查',
          '自定义窗口按模型真实上限填，别一味放大',
          '关掉总开关不等于清空数据，只是隐藏了 AI 页签',
          '生成中关闭总开关会中断这一轮，已生成的部分不会丢'
        ])
      ]
    }
  ]
}
