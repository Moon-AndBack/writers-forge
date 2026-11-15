import { seedBulletList, seedHeading, seedOutlineDoc, seedParagraph } from '../seedBlocks'
import type { SeedOutlineGroup } from './outline'

/**
 * 教学书大纲域 · 快速上手 + 章节与大纲（10 条）。
 *
 * 大纲条目是功能速查：只讲规则与边界，流程细节见同书章节正文。
 * 维护约定见 `./outline.ts` 与 AGENTS §7.5。
 */
export const OUTLINE_QUICK_GROUPS: readonly SeedOutlineGroup[] = [
  {
    group: '快速上手',
    entries: [
      {
        title: '第一次启动：笔名与书架',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '首次启动先停在欢迎卡，只填一个笔名；去掉首尾空白后不能为空，提交后进入书架。'
          ),
          seedBulletList([
            '笔名是全局署名，不按书区分；之后可在「设置 → 基础偏好」里改，清空后书籍卡显示「未署名」。',
            '首启书架只有这本教学书，和普通书同权：可以读、可以改，也可以删。',
            '笔名不是账号：不联网、没有密码，只用于本地署名。'
          ])
        ])
      },
      {
        title: '书架的三件事',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('书架是启动后的默认页，只负责找书、建书与删书；正文写作要进写作页。'),
          seedBulletList([
            '找书：状态筛选 7 档、按书名搜索、4 档排序，三者可以叠加；搜索不搜简介与作者。',
            '建书与改书：标题栏加号或空态按钮新建；封面悬停的铅笔改书名、简介、状态、频道、篇幅、封面色与分类。',
            '删书：封面垃圾桶加二次确认，整本书连同章节、卷、大纲、剧情、设定与封面一起永久删除，不进回收站。'
          ])
        ])
      },
      {
        title: '写作页的三栏与模块切换',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '写作页固定三栏：左栏导航、中栏正文、右栏详情；两条分隔条可拖宽，宽度会记住。'
          ),
          seedBulletList([
            '活动栏共 11 个模块：章节、大纲、剧情、五个设定域，再加时间线、伏笔、灵感。',
            'Ctrl+1–9 切前九个模块；伏笔与灵感没有数字键；当前模块有未保存草稿时，先问保存还是放弃。',
            '五个设定域、伏笔、灵感没有左栏；窗口过窄时右栏强制隐藏，右栏按钮同时禁用。'
          ])
        ])
      }
    ]
  },
  {
    group: '章节与大纲',
    entries: [
      {
        title: '卷与章的三种形态',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '章节页的卷分三种：正文卷、自定义卷、系统「未分卷」。正文卷自动编号「卷X」，可写卷纲、可建特殊章；自定义卷整名必填、不参与编号，也不出现在大纲页。'
          ),
          seedBulletList([
            '「未分卷」只在确实有未归卷的章时出现，不能建章、改名或删除，只做收纳。',
            '普通章恒占编号，显示「第X章 · 名」；特殊章有前段（序章 / 番外），不占号，可置顶或置底。',
            '特殊章只能建在正文卷下；自定义卷适合番外、设定补遗这类不编号的内容。'
          ])
        ])
      },
      {
        title: '章节正文是纯段落',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '章节正文只有段落，没有格式工具栏，也不提供标题、列表、引用、代码块、表格与图片。'
          ),
          seedBulletList([
            '行内格式只能靠快捷键：Ctrl+B 加粗、Ctrl+I 斜体、Ctrl+U 下划线。',
            'Ctrl+Shift+S 删除线，Ctrl+E 行内代码；撤销 Ctrl+Z，重做 Ctrl+Shift+Z。',
            '需要标题层级、清单或表格，写到大纲条目里，不要指望章节正文。'
          ])
        ])
      },
      {
        title: '保存的三层保险',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '正文保存有三层：自动保存、手动保存、切走强制落库。关掉自动保存只是拆掉第一层。'
          ),
          seedBulletList([
            '自动保存：开启时停笔约 800ms 自动落库，默认开启，开关在「设置 → 基础偏好」。',
            '手动保存：标题栏的「保存」按钮或 Ctrl+S；没有改动、加载中、保存中时按钮禁用。',
            '强制落库：切章、切模块、关闭窗口前都会写完挂起改动，切走不弹确认框。'
          ])
        ])
      },
      {
        title: '两套查找替换',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('章节与大纲都用 Ctrl+F 打开查找替换，但能搜的范围不同。'),
          seedBulletList([
            '章节搜索可切「本章 / 全书」；全书范围会逐章替换，动手前先看清。',
            '大纲搜索没有范围切换，只搜当前条目的正文，不能跨条目或跨全书。',
            '右键「搜索选中文字」沿用同一口径：章节强制回「本章」，大纲只搜当前条目。',
            'Ctrl+F 只在章节与大纲响应，其它模块按了不会出现查找框。'
          ])
        ])
      },
      {
        title: '回收站与永久删除的边界',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('章节与大纲有回收站，伏笔与灵感没有；剧情节点与时间线也没有还原入口。'),
          seedBulletList([
            '章节、大纲条目与卷 / 分组都可还原；灵感与伏笔的删除是永久删除，删前先另存关键信息。',
            '删卷会跨域：章节模块删卷，大纲条目进大纲回收站；大纲模块删卷，章节进章节回收站。',
            '两个回收站各管一套数据，还原卷也只带回本域内容，另一边要分别去还原。'
          ])
        ])
      },
      {
        title: '卷纲：整卷的提纲',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph('在大纲左栏点开一个正文卷，中栏编辑的是这个卷的卷纲——整卷层面的提纲。'),
          seedBulletList([
            '卷纲不是某一章的细纲，也不是卷内所有条目的合集；它独立于每个条目。',
            '卷纲与条目共用同一套富文本编辑器，保存方式与 20 万字上限也一致。',
            '给单章做规划，请在该卷下新建条目，不要把细纲塞进卷纲。'
          ])
        ])
      },
      {
        title: '右栏页签：章节六项 / 大纲四项',
        doc: seedOutlineDoc([
          seedHeading('要点'),
          seedParagraph(
            '章节与大纲共用同一套右栏页签，只切换可见子集；页签顺序的唯一真源是 rightPaneTabSets。'
          ),
          seedBulletList([
            '章节：大纲、剧情、伏笔、灵感、实体、AI，默认停在「大纲」。',
            '大纲：剧情、伏笔、灵感、实体，没有「大纲」与「AI」，实体排在最后。',
            '设置里关掉 AI 助手后，章节页签只剩五项（AI 整块卸载），其余模块不受影响。',
            '剧情、伏笔、灵感、实体四页都只读：点卡片进右栏详情，改内容回对应模块。'
          ])
        ])
      }
    ]
  }
]
