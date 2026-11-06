/**
 * preload 类型域 · **窗口全局 `Api`**（渲染层经 `window.api` 取类型的**唯一入口**）。
 *
 * 属 `src/preload/types/` 按域拆分产物（`index.d.ts` 原 611 行，超 §3 的 500 行上限）。
 *
 * 🔴 **硬闸门**：`declare global { interface Window { api: Api } }` 是渲染层取 preload 类型
 * 的**唯一通道**。本文件被 `index.d.ts` 以 `import type { Api }` 引用并由其转发到全局——
 * **切错此处会导致整层渲染类型失联**，任何调整都须以 `npm run typecheck:web` 通过为准。
 *
 * 本文件**只组装通道签名**（各域入参 / 出参类型一律从 `./database` / `./outline` /
 * `./entities` / `./plot` 经 `import type` 取用），与 `index.ts` 的 `api` 对象**逐一对应**：
 * 改主进程通道须同步两侧。
 */

import type {
  BookRow,
  BookStats,
  ChapterPin,
  ChapterReplaceAllInput,
  ChapterReplaceAllResult,
  ChapterReplaceInput,
  ChapterReplaceResult,
  ChapterRow,
  ChapterSearchInput,
  ChapterSearchPage,
  ChapterStats,
  ChapterStatus,
  CreateBookInput,
  CreateChapterInput,
  CreateVolumeInput,
  DeletedContent,
  ParagraphRow,
  PurgeCounts,
  RenameChapterPatch,
  UpdateBookPatch,
  VolumeRow
} from './database'
import type {
  CoverPayload,
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneEntityInput,
  PlotSceneEntityRow,
  PlotSceneRow,
  SnapConfig,
  SnapStatus,
  TitleBarOverlayOptions,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch,
  WindowMaterial
} from './plot'
import type {
  CreateEntityInput,
  EntityDetail,
  EntityMatch,
  EntityRow,
  UpdateEntityPatch
} from './entities'
import type {
  DeletedOutlineContent,
  OutlineContentPayload,
  OutlineItemRow,
  OutlinePurgeCounts,
  OutlineVolumeRow
} from './outline'
import type { DiagnosticsReport } from './diagnostics'
import type {
  CategoryRow,
  CreateCustomCategoryInput,
  DeleteCustomCategoryResult
} from './categories'
import type { ChipColorRow } from './chipColors'
import type { CleanWordsApi } from './cleanWords'
import type { OneDriveApi } from './onedrive'
import type { AiApi } from './ai'
import type { ImagePayload, ImageRow } from './images'
import type {
  CreateWorldEntityInput,
  UpdateWorldEntityPatch,
  UpdateWorldPowerSystemPatch,
  UpdateWorldRefPatch,
  WorldAliasRow,
  WorldEntityDetail,
  WorldEntityRow,
  WorldEntityType,
  WorldPowerSystemRow,
  WorldRefInput,
  WorldRefRow,
  WorldSemanticCodeRow,
  WorldTagRow,
  WorldTextContent
} from './worldEntity'
import type {
  CreateWorldSubtypeInput,
  UpdateWorldSubtypePatch,
  WorldSubtypeDeleteOutcome,
  WorldSubtypeRow
} from './worldSubtype'
import type {
  AttachForeshadowAnchorResult,
  ForeshadowAnchor,
  ForeshadowCreatePayload,
  ForeshadowRow,
  ForeshadowUpdatePatch,
  SetForeshadowAbandonedResult
} from '../../main/database/foreshadows'
import type { ClearForeshadowAnchorResult } from '../../main/database/foreshadowsClear'
import type { ForeshadowAnchorHit } from '../../main/database/foreshadowsQuery'
import type { DeletedForeshadowRow } from '../../main/database/foreshadowsTrash'
import type {
  DeletedInspirationRow,
  InspirationCreatePayload,
  InspirationRow,
  InspirationUpdatePatch
} from '../../main/database/inspirations'

/** 段落保存结果：`ok=false` 表示入参非法或章节不存在。 */
interface SaveParagraphsResult {
  ok: boolean
  count?: number
}

/**
 * preload 暴露给渲染层的全部 IPC 通道（`contextBridge.exposeInMainWorld('api', …)`）。
 * 与 `index.ts` 的 `api` 对象**逐成员对应**（`typeof api`）。
 */
export interface Api {
  versions: {
    node: string
    chrome: string
    electron: string
  }
  ping: () => string
  /** 应用关闭流程：主进程关窗前先通知渲染层统一落盘，收到回执后才真正关闭窗口 */
  app: {
    /** 订阅「即将关闭」通知，返回取消订阅函数 */
    onBeforeClose: (callback: () => void) => () => void
    /** 落盘完成回执；主进程收到后才关窗（约 3 秒未回执则超时强制关闭） */
    notifyCloseReady: () => void
  }
  books: {
    list: () => Promise<BookRow[]>
    get: (id: string) => Promise<BookRow | null>
    create: (input: CreateBookInput) => Promise<BookRow | null>
    update: (id: string, patch: UpdateBookPatch) => Promise<BookRow | null>
    delete: (id: string) => Promise<boolean>
    /** 批量取全部书籍真实统计（章数 / 定稿数 / 有效字数 / 进度），键为 bookId */
    statsAll: () => Promise<Record<string, BookStats>>
    cover: {
      get: (bookId: string) => Promise<CoverPayload | null>
      /** data 传 Uint8Array / ArrayBuffer，主进程存为 BLOB */
      set: (bookId: string, mime: string, data: Uint8Array) => Promise<boolean>
      delete: (bookId: string) => Promise<boolean>
    }
  }
  /** 分类域：官方分类 + 用户自定义分类的统一两级树 */
  categories: {
    /** 读全树（含自定义）；渲染层自行按 `parentId` 组装层级 */
    list: () => Promise<CategoryRow[]>
    /** 创建自定义分类（强制 channel=NULL / is_custom=1）；非法 / 重名 → null */
    create: (input: CreateCustomCategoryInput) => Promise<CategoryRow | null>
    /** 重命名自定义分类（仅 is_custom=1）；非法 / 重名 / 非自定义 / 不存在 → null */
    rename: (id: number, name: string) => Promise<CategoryRow | null>
    /** 删除自定义分类；被书籍引用时返回结构化失败（含占用书数），文案由渲染层渲染 */
    delete: (id: number) => Promise<DeleteCustomCategoryResult>
  }
  chapters: {
    listVolumes: (bookId: string) => Promise<VolumeRow[]>
    list: (bookId: string) => Promise<ChapterRow[]>
    createVolume: (bookId: string, input?: CreateVolumeInput) => Promise<VolumeRow | null>
    /** 改卷名段（title）；空白归空串。「卷X」编号由渲染层按序号动态拼出 */
    renameVolume: (id: number, title: string) => Promise<VolumeRow | null>
    deleteVolume: (id: number) => Promise<boolean>
    reorderVolume: (id: number, index: number) => Promise<boolean>
    create: (bookId: string, input: CreateChapterInput) => Promise<ChapterRow | null>
    rename: (id: number, patch: RenameChapterPatch) => Promise<ChapterRow | null>
    /** 改章节状态（两态：draft=草稿 / done=定稿） */
    setStatus: (id: number, status: ChapterStatus) => Promise<ChapterRow | null>
    /** 特殊章置顶 / 置底（'top' | 'bottom'）；普通章 / 不存在返回 null */
    setPin: (id: number, pin: ChapterPin) => Promise<ChapterRow | null>
    delete: (id: number) => Promise<boolean>
    reorder: (id: number, index: number) => Promise<boolean>
    /** 跨卷移动（volumeId 必填，未分卷语义已移除） */
    move: (id: number, volumeId: number) => Promise<boolean>
    /** 读取该章全部段落（idx 升序；documents 域已废除，正文直接归属章节） */
    getParagraphs: (chapterId: number) => Promise<ParagraphRow[]>
    /** 全量重写该章段落（idx 0..n-1）；入参非法 / 章不存在返回 { ok: false } */
    saveParagraphs: (
      chapterId: number,
      paragraphs: Array<{ text: string; contentJson?: string | null }>
    ) => Promise<SaveParagraphsResult>
    stats: (bookId: string) => Promise<ChapterStats>
    /** 下一个默认卷名（「卷X」），供创建前预览 */
    nextVolumeTitle: (bookId: string) => Promise<string>
    /** 下一个默认章名（「第X章」，卷内独立编号）；达上限返回空串 */
    nextChapterTitle: (bookId: string, volumeId: number) => Promise<string>
    /** 回收站内容（软删的卷与章，章含原归属卷名） */
    listDeleted: (bookId: string) => Promise<DeletedContent>
    /** 还原章（追加到所属分组末尾） */
    restore: (id: number) => Promise<boolean>
    /** 还原卷及其下软删章 */
    restoreVolume: (id: number) => Promise<boolean>
    /** 彻底删除章（含关联文档） */
    purge: (id: number) => Promise<boolean>
    /** 彻底删除卷（含其下章与文档） */
    purgeVolume: (id: number) => Promise<boolean>
    /** 清空回收站 */
    purgeAllDeleted: (bookId: string) => Promise<PurgeCounts>
    /** 搜索（本章 / 全书）：子串全表扫描，缓存 + 分页，返回一页命中 */
    search: (bookId: string, input: ChapterSearchInput) => Promise<ChapterSearchPage>
    /** 单条替换（段落 + 段内偏移）；过期命中返回 replaced=0 */
    replace: (bookId: string, input: ChapterReplaceInput) => Promise<ChapterReplaceResult>
    /** 替换全部（本章 / 全书） */
    replaceAll: (bookId: string, input: ChapterReplaceAllInput) => Promise<ChapterReplaceAllResult>
  }
  entities: {
    /** 旧实体表 CRUD（保留兼容；正文匹配链路已改用统一设定库） */
    list: (bookId: string) => Promise<EntityRow[]>
    get: (id: number) => Promise<EntityDetail | null>
    create: (input: CreateEntityInput) => Promise<EntityDetail | null>
    update: (id: number, patch: UpdateEntityPatch) => Promise<EntityDetail | null>
    delete: (id: number) => Promise<boolean>
    /** 正文实体匹配：词表来自统一设定库主表（world_entities + world_aliases） */
    match: (bookId: string, text: string) => Promise<EntityMatch[]>
    /** 批量正文实体匹配：一次 IPC 匹配多段文本（结果与入参等长同序） */
    matchMany: (bookId: string, texts: string[]) => Promise<EntityMatch[][]>
    /** 词表版本签名（统一设定库实体 / 别名变更即变），供渲染层匹配缓存失效判定 */
    revision: (bookId: string) => Promise<string>
  }
  /** 统一设定库（四域统一寻址，软删除；含别名 / 长文本 / 标签 / 引用 / 境界体系） */
  worldEntity: {
    list: (bookId: string, type?: WorldEntityType, subtypeId?: number) => Promise<WorldEntityRow[]>
    get: (id: number) => Promise<WorldEntityDetail | null>
    create: (input: CreateWorldEntityInput) => Promise<WorldEntityDetail | null>
    update: (id: number, patch: UpdateWorldEntityPatch) => Promise<WorldEntityDetail | null>
    /** 软删除（仅置 deleted_at），命中返回 true */
    delete: (id: number) => Promise<boolean>
    listAliases: (id: number) => Promise<WorldAliasRow[]>
    /** 整体替换别名，实体不存在 / 已软删返回 false */
    setAliases: (id: number, aliases: string[]) => Promise<boolean>
    getText: (id: number) => Promise<WorldTextContent>
    /** 写入长文本（body 纯文本摘要 + bodyJson 富文本 JSON），实体不存在 / 已软删返回 false */
    saveText: (id: number, body: string, bodyJson?: string) => Promise<boolean>
    listTags: (bookId: string) => Promise<WorldTagRow[]>
    /** 整体替换实体标签，返回写入后的标签名；实体不存在 / 已软删返回 null */
    setTags: (id: number, names: string[]) => Promise<string[] | null>
    /** 出边关系（可按语义码筛选） */
    listRefs: (id: number, semanticCode?: string) => Promise<WorldRefRow[]>
    /** 入边关系（引用当前实体的关系，可按语义码筛选） */
    listIncomingRefs: (id: number, semanticCode?: string) => Promise<WorldRefRow[]>
    /** 关系类型字典（界面下拉；`from_type` / `to_type` 仅为元数据） */
    listSemanticCodes: () => Promise<WorldSemanticCodeRow[]>
    /** 新增关系；语义码必填且须在字典内 */
    addRef: (input: WorldRefInput) => Promise<WorldRefRow | null>
    /** 更新关系（语义码 / 补充说明 / 备注 / 序 / 有效期） */
    updateRef: (id: number, patch: UpdateWorldRefPatch) => Promise<WorldRefRow | null>
    removeRef: (id: number) => Promise<boolean>
    listPowerSystems: (bookId: string) => Promise<WorldPowerSystemRow[]>
    updatePowerSystem: (
      entityId: number,
      patch: UpdateWorldPowerSystemPatch
    ) => Promise<WorldPowerSystemRow | null>
  }
  /** 统一设定库：子类分类表（预设 + 自定义，软删除） */
  worldSubtype: {
    list: (bookId: string, entityType?: WorldEntityType) => Promise<WorldSubtypeRow[]>
    /** 创建子类；非法 / 同书同类型已有未软删同名 → null（同名已软删则复活该行） */
    create: (input: CreateWorldSubtypeInput) => Promise<WorldSubtypeRow | null>
    /** 更新名称 / 排序 / 路由键；不存在 / 已软删 / 空补丁 → null */
    update: (id: number, patch: UpdateWorldSubtypePatch) => Promise<WorldSubtypeRow | null>
    /** 删除子类（软删）；非空拒绝 → `inUse`，预设分类 → `notCustom`，异常 → `failed` */
    delete: (id: number) => Promise<WorldSubtypeDeleteOutcome>
    /** 幂等补齐 23 条预设，返回是否新建了至少一行 */
    ensurePresets: (bookId: string) => Promise<boolean>
  }
  /** 胶囊配色表（28 行：23 预设子类 + 5 模块兜底），全局只读 */
  chipColors: {
    list: () => Promise<ChipColorRow[]>
  }
  /** 图片域：大纲正文内嵌图片的二进制资源（按书隔离，删书级联删除） */
  images: {
    /** 写入一张图片（`bookId` = 归属书）；mime 白名单 / 20 MB 上限非法 → null */
    create: (bookId: string, mime: string, data: Uint8Array) => Promise<ImageRow | null>
    /** 按 id 取图片二进制（`data` 为 Uint8Array）；不存在 → null */
    get: (id: number) => Promise<ImagePayload | null>
    /** 物理删除图片；不清理正文内引用（悬空 id 由正文按缺图占位容忍） */
    delete: (id: number) => Promise<boolean>
  }
  /** 大纲域：独立条目结构（不复用章节表）；正文内联在 outline_items.content_json */
  outline: {
    listVolumes: (bookId: string) => Promise<OutlineVolumeRow[]>
    list: (bookId: string) => Promise<OutlineItemRow[]>
    /** 创建正文卷；name 缺省 →「新卷」；同事务建卷级大纲行（scope='volume'） */
    createVolume: (bookId: string, name?: string) => Promise<OutlineVolumeRow | null>
    /** 重命名卷（改 title 名段） */
    renameVolume: (id: number, name: string) => Promise<OutlineVolumeRow | null>
    /** 软删除卷（级联软删其下条目） */
    deleteVolume: (id: number) => Promise<boolean>
    reorderVolume: (id: number, index: number) => Promise<boolean>
    /** 创建条目；title 可空 = 纯自定义名、无编号；volumeId 为 null = 独立条目（置顶），
     *  为数字 = 挂到该书的正文卷或分组卷（volumes.kind ∈ ('normal','group')）下 */
    create: (
      bookId: string,
      volumeId: number | null,
      title?: string
    ) => Promise<OutlineItemRow | null>
    /** 创建分组容器（落一行 volumes.kind='group'，其下不产生条目行）；title 可空 */
    createGroup: (bookId: string, title?: string) => Promise<OutlineVolumeRow | null>
    /** 重命名条目（改 title） */
    rename: (id: number, title: string) => Promise<OutlineItemRow | null>
    /** 软删除条目 */
    delete: (id: number) => Promise<boolean>
    reorder: (id: number, index: number) => Promise<boolean>
    /** 跨卷移动（移至目标卷末尾） */
    move: (id: number, volumeId: number) => Promise<boolean>
    /** 读取正文（条目 / 卷级大纲通用）；不存在或已软删返回 null */
    getContent: (itemId: number) => Promise<OutlineContentPayload | null>
    /** 按卷 id 读取该卷的卷级大纲行（`scope='volume'`，即卷纲）正文载荷；
     *  渲染层点开正文卷时经此拿到卷纲载体行 id；无卷纲行 / 已软删 / 卷不存在 → null */
    getVolumeOutline: (volumeId: number) => Promise<OutlineContentPayload | null>
    /** 保存正文：contentJson 非空须为合法 JSON 串（主进程复验），空串/null = 清空正文；
     *  text = 调用方派生的纯文本摘要（字数统计与搜索真源）；行不存在返回 false */
    saveContent: (itemId: number, contentJson: string | null, text: string) => Promise<boolean>
    /** 回收站内容（软删的卷与条目；条目含原归属卷名 volumeTitle） */
    listDeleted: (bookId: string) => Promise<DeletedOutlineContent>
    /** 还原条目（追加到所属卷末尾） */
    restore: (id: number) => Promise<boolean>
    /** 还原卷及其下软删条目 */
    restoreVolume: (id: number) => Promise<boolean>
    /** 彻底删除条目 */
    purge: (id: number) => Promise<boolean>
    /** 彻底删除卷（含其下条目） */
    purgeVolume: (id: number) => Promise<boolean>
    /** 清空回收站 */
    purgeAllDeleted: (bookId: string) => Promise<OutlinePurgeCounts>
  }
  /** 剧情域：剧情线 → 场景节点两级结构（不复用章节 / 大纲表；仅 CRUD，无拖拽） */
  plot: {
    listLines: (bookId: string) => Promise<PlotLineRow[]>
    listScenes: (bookId: string) => Promise<PlotSceneRow[]>
    /** 创建剧情线；name 缺省 →「新剧情线」；options 缺省取默认类型 + 首色 */
    createLine: (
      bookId: string,
      name?: string,
      options?: CreatePlotLineOptions
    ) => Promise<PlotLineRow | null>
    renameLine: (id: number, name: string) => Promise<PlotLineRow | null>
    /** 更新剧情线（名称 / 类型 / 颜色；仅覆盖提供的字段） */
    updateLine: (id: number, patch: UpdatePlotLinePatch) => Promise<PlotLineRow | null>
    /** 软删除剧情线（级联软删其下场景） */
    deleteLine: (id: number) => Promise<boolean>
    /** 创建场景（lineId 须属同书剧情线） */
    createScene: (
      bookId: string,
      lineId: number,
      input?: CreatePlotSceneInput
    ) => Promise<PlotSceneRow | null>
    /** 更新场景（仅覆盖提供的字段） */
    updateScene: (id: number, patch: UpdatePlotScenePatch) => Promise<PlotSceneRow | null>
    /** 软删除场景 */
    deleteScene: (id: number) => Promise<boolean>
    /** 读取场景的手动关联设定（统一设定库实体，含名称 / 类型） */
    listSceneEntities: (sceneId: number) => Promise<PlotSceneEntityRow[]>
    /** 整体替换场景的关联设定；场景不存在 / 入参畸形 → null */
    setSceneEntities: (
      sceneId: number,
      rows: PlotSceneEntityInput[]
    ) => Promise<PlotSceneEntityRow[] | null>
  }
  /** 伏笔域：锚点快照（不存 paragraph_id）；本批仅数据层 / IPC，UI 后续批次接入 */
  foreshadow: {
    list: (bookId: string) => Promise<ForeshadowRow[]>
    get: (id: number) => Promise<ForeshadowRow | null>
    create: (bookId: string, payload: ForeshadowCreatePayload) => Promise<ForeshadowRow | null>
    update: (id: number, patch: ForeshadowUpdatePatch) => Promise<ForeshadowRow | null>
    delete: (id: number) => Promise<boolean>
    /** 按章节或大纲条目取锚定伏笔（章节 → 正文埋点 / 大纲 → 大纲埋点；优先 chapterId） */
    listByAnchor: (chapterId?: number, outlineItemId?: number) => Promise<ForeshadowRow[]>
    /** 锚点反查命中（同上匹配，回传命中槽位 `body` / `outline`） */
    listByAnchorHit: (chapterId?: number, outlineItemId?: number) => Promise<ForeshadowAnchorHit[]>
    /** 给伏笔补缺失的埋点槽位（槽位由锚点 kind 决定；槽位已占用以 `{ ok: false }` 返回） */
    attachAnchor: (id: number, anchor: ForeshadowAnchor) => Promise<AttachForeshadowAnchorResult>
    /** 清空正文埋点（`body_*` → none）；已回收 → `recovered`，不存在 → `notFound` */
    clearBodyAnchor: (id: number) => Promise<ClearForeshadowAnchorResult>
    /** 清空大纲埋点（`outline_*` → none）；已回收 → `recovered`，不存在 → `notFound` */
    clearOutlineAnchor: (id: number) => Promise<ClearForeshadowAnchorResult>
    /** 清空回收点（`recover_*` → none）；不存在 / 已软删 → null（撤销回收不受限） */
    clearRecoverAnchor: (id: number) => Promise<ForeshadowRow | null>
    /** 切换废弃标记（可撤销）；有回收点的伏笔拒绝废弃（`reason: 'recovered'`） */
    setAbandoned: (id: number, abandoned: boolean) => Promise<SetForeshadowAbandonedResult>
    /** 回收点锚点反查（章节 / 大纲条目，两者都给时优先 chapterId） */
    listByRecoverAnchor: (chapterId?: number, outlineItemId?: number) => Promise<ForeshadowRow[]>
    /** 回收站内容（软删伏笔，`deleted_at DESC`） */
    listDeleted: (bookId: string) => Promise<DeletedForeshadowRow[]>
    /** 还原伏笔（仅回收站行） */
    restore: (id: number) => Promise<boolean>
    /** 彻底删除伏笔（物理删整行，双埋点 / 回收点一并消失） */
    purge: (id: number) => Promise<boolean>
    /** 清空本书伏笔回收站，返回删除条数 */
    purgeAllDeleted: (bookId: string) => Promise<number>
  }
  /** 灵感域：碎片速记 + JSON 标签；本批仅数据层 / IPC，UI 后续批次接入 */
  inspiration: {
    /** 列出未删除灵感（`updated_at DESC`）；`tag` 非空时按标签筛选 */
    list: (bookId: string, tag?: string) => Promise<InspirationRow[]>
    /** 列出该书已使用的去重标签（供筛选下拉） */
    tags: (bookId: string) => Promise<string[]>
    /** 新建灵感（标题 / 正文 / 标签均可选） */
    create: (bookId: string, payload?: InspirationCreatePayload) => Promise<InspirationRow | null>
    /** 更新灵感（仅覆盖提供的字段） */
    update: (id: number, patch?: InspirationUpdatePatch) => Promise<InspirationRow | null>
    /** 软删除灵感 */
    delete: (id: number) => Promise<boolean>
    /** 回收站内容（软删灵感，`deleted_at DESC`；标签已反序列化） */
    listDeleted: (bookId: string) => Promise<DeletedInspirationRow[]>
    /** 还原灵感（仅回收站行） */
    restore: (id: number) => Promise<boolean>
    /** 彻底删除灵感（物理删，仅回收站行） */
    purge: (id: number) => Promise<boolean>
    /** 清空本书灵感回收站，返回删除条数 */
    purgeAllDeleted: (bookId: string) => Promise<number>
  }
  settings: {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<boolean>
    /** ⚠️ 不回传 `ai:*` 前缀键（其中含加密后的密钥；主进程侧已过滤） */
    all: () => Promise<Record<string, string>>
    remove: (key: string) => Promise<boolean>
  }
  /** AI 域：配置（仅掩码视图）/ 模型列表 / 连通性测试 / 流式对话 + 会话与消息 */
  ai: AiApi
  /** 违禁词库：词表浏览 / 计数 / 检测用启用词 / 用户词导入（来源固定 user）/ 启停 / 删除 */
  cleanWords: CleanWordsApi
  /** OneDrive 备份：授权 / 状态 / 手动备份 + 进度订阅（错误以结构化 code 回传） */
  onedrive: OneDriveApi
  stats: {
    /** 全书累计有效字数 */
    totalWords: () => Promise<number>
    /** 今日写作字数（净增量，展示取 max(0, …)） */
    todayWords: () => Promise<number>
    /** 连续写作天数 */
    streakDays: () => Promise<number>
    /** 批量取全部书籍真实统计（键为 bookId） */
    bookStatsAll: () => Promise<Record<string, BookStats>>
  }
  /** 数据健康自检：启动时主进程跑一次并缓存，此处只读拉取 */
  diagnostics: {
    get: () => Promise<DiagnosticsReport>
  }
  titleBar: {
    setOverlay: (options: TitleBarOverlayOptions) => Promise<boolean>
  }
  windowMaterial: {
    /** 切换窗口系统材质（'acrylic' 开透明 / 'none' 关）；返回实际生效值（不支持时降级 'none'） */
    set: (material: WindowMaterial) => Promise<WindowMaterial | null>
    /** 当前系统是否支持 Acrylic（Electron 限制：仅 Windows 11 22H2+） */
    acrylicSupported: () => Promise<boolean>
  }
  windowSnap: {
    /** 开启宽度磁吸并上报配置，非法配置返回 false */
    set: (config: SnapConfig) => Promise<boolean>
    /** 关闭磁吸（离开书籍页时调用） */
    clear: () => Promise<boolean>
    /** 读取当前吸附状态 */
    status: () => Promise<SnapStatus | null>
    /** 当前窗口外宽（DIP） */
    boundsWidth: () => Promise<number>
  }
  /** 系统强调色（品牌色）：仅 light / dark 主题消费，sage / honey 用主题静态色 */
  systemTheme: {
    /** 读取系统强调色，已解析为 `#rrggbb`；系统不支持 / 读取失败时为 null */
    getAccentColor: () => Promise<string | null>
    /** 订阅系统强调色变化，返回取消订阅函数 */
    onAccentChange: (callback: (color: string | null) => void) => () => void
  }
}
