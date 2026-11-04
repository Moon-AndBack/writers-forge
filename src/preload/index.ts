import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BookRow, CreateBookInput, UpdateBookPatch } from '../main/database/books'
import type { CategoryRow } from '../main/database/categories'
import type {
  CreateCustomCategoryInput,
  DeleteCustomCategoryResult
} from '../main/database/categoriesWrite'
import type {
  ChapterPin,
  ChapterRow,
  ChapterStats,
  ChapterStatus,
  CreateChapterInput,
  CreateVolumeInput,
  RenameChapterPatch,
  VolumeRow
} from '../main/database/chapters'
import type { DeletedContent, PurgeCounts } from '../main/database/chapterTrash'
import type {
  ChapterReplaceAllInput,
  ChapterReplaceAllResult,
  ChapterReplaceInput,
  ChapterReplaceResult,
  ChapterSearchInput,
  ChapterSearchPage
} from '../main/database/chapterSearch'
import type {
  DeletedOutlineContent,
  OutlineContentPayloadRow,
  OutlineItemRow,
  OutlinePurgeCounts,
  OutlineVolumeRow
} from '../main/database/outline'
import type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineRow,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch
} from '../main/database/plot'
import type { PlotSceneEntityInput, PlotSceneEntityRow } from '../main/database/plotSceneEntities'
import type {
  AttachForeshadowAnchorResult,
  ForeshadowAnchor,
  ForeshadowCreatePayload,
  ForeshadowRow,
  ForeshadowUpdatePatch
} from '../main/database/foreshadows'
import type { ForeshadowAnchorHit } from '../main/database/foreshadowsQuery'
import type { DiagnosticsReport } from '../main/database/diagnostics'
import type {
  CreateEntityInput,
  EntityDetail,
  EntityRow,
  UpdateEntityPatch
} from '../main/database/entities'
import type { EntityMatch } from '../main/match/entityMatcher'
import type { SnapConfig, SnapStatus } from '../main/resizeSnap'
import type { ParagraphRow } from '../main/database/paragraphs'
import type { BookStats } from '../main/database/stats'
import type { ImagePayload, ImageRow } from './types/images'
import { worldEntityApi } from './api/worldEntity'
import { worldSubtypeApi } from './api/worldSubtype'
import { chipColorsApi } from './api/chipColors'
import { aiApi } from './api/ai'
import { cleanWordsApi } from './api/cleanWords'
import { onedriveApi } from './api/onedrive'

/** 封面图读取结果：`data` 为 Uint8Array（structured clone 跨 IPC 传输形式）。 */
export interface CoverPayload {
  mime: string
  data: Uint8Array
}

export interface TitleBarOverlayOptions {
  color?: string
  symbolColor?: string
  height?: number
}

const api = {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  ping: (): string => 'pong',
  /** 应用关闭流程：主进程关窗前先通知渲染层统一落盘，收到回执后才真正关闭窗口 */
  app: {
    /** 订阅「即将关闭」通知，返回取消订阅函数（内部 removeListener，不暴露 ipcRenderer） */
    onBeforeClose: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('app:before-close', listener)
      return () => {
        ipcRenderer.removeListener('app:before-close', listener)
      }
    },
    /** 落盘完成回执；主进程收到后才关窗（约 3 秒未回执则超时强制关闭） */
    notifyCloseReady: (): void => {
      ipcRenderer.send('app:close-ready')
    }
  },
  books: {
    list: (): Promise<BookRow[]> => ipcRenderer.invoke('books:list'),
    get: (id: string): Promise<BookRow | null> => ipcRenderer.invoke('books:get', id),
    create: (input: CreateBookInput): Promise<BookRow | null> =>
      ipcRenderer.invoke('books:create', input),
    update: (id: string, patch: UpdateBookPatch): Promise<BookRow | null> =>
      ipcRenderer.invoke('books:update', id, patch),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('books:delete', id),
    /**
     * 批量取全部书籍的真实统计（章数 / 定稿数 / 有效字数 / 进度），键为 bookId。
     * 书架一次性获取，避免逐书调 chapters:stats 的 N+1 IPC。
     */
    statsAll: (): Promise<Record<string, BookStats>> => ipcRenderer.invoke('stats:bookStatsAll'),
    cover: {
      get: (bookId: string): Promise<CoverPayload | null> =>
        ipcRenderer.invoke('books:cover:get', bookId),
      /** data 传 Uint8Array / ArrayBuffer，主进程存为 BLOB */
      set: (bookId: string, mime: string, data: Uint8Array): Promise<boolean> =>
        ipcRenderer.invoke('books:cover:set', bookId, mime, data),
      delete: (bookId: string): Promise<boolean> => ipcRenderer.invoke('books:cover:delete', bookId)
    }
  },
  /** 分类域：官方分类 + 用户自定义分类的统一两级树 */
  categories: {
    /** 读全树（含自定义）；渲染层自行按 `parentId` 组装层级 */
    list: (): Promise<CategoryRow[]> => ipcRenderer.invoke('categories:list'),
    /** 创建自定义分类；非法 / 重名 → null */
    create: (input: CreateCustomCategoryInput): Promise<CategoryRow | null> =>
      ipcRenderer.invoke('categories:create', input),
    /** 重命名自定义分类；非法 / 重名 / 非自定义 / 不存在 → null */
    rename: (id: number, name: string): Promise<CategoryRow | null> =>
      ipcRenderer.invoke('categories:rename', id, name),
    /** 删除自定义分类；被引用时返回结构化失败（含占用书数） */
    delete: (id: number): Promise<DeleteCustomCategoryResult> =>
      ipcRenderer.invoke('categories:delete', id)
  },
  chapters: {
    listVolumes: (bookId: string): Promise<VolumeRow[]> =>
      ipcRenderer.invoke('chapters:listVolumes', bookId),
    list: (bookId: string): Promise<ChapterRow[]> => ipcRenderer.invoke('chapters:list', bookId),
    createVolume: (bookId: string, input?: CreateVolumeInput): Promise<VolumeRow | null> =>
      ipcRenderer.invoke('chapters:createVolume', bookId, input ?? {}),
    /** 改卷名段（title）；空白归空串。「卷X」编号由渲染层按序号动态拼出 */
    renameVolume: (id: number, title: string): Promise<VolumeRow | null> =>
      ipcRenderer.invoke('chapters:renameVolume', id, title),
    deleteVolume: (id: number): Promise<boolean> => ipcRenderer.invoke('chapters:deleteVolume', id),
    reorderVolume: (id: number, index: number): Promise<boolean> =>
      ipcRenderer.invoke('chapters:reorderVolume', id, index),
    create: (bookId: string, input: CreateChapterInput): Promise<ChapterRow | null> =>
      ipcRenderer.invoke('chapters:create', bookId, input),
    rename: (id: number, patch: RenameChapterPatch): Promise<ChapterRow | null> =>
      ipcRenderer.invoke('chapters:rename', id, patch),
    setStatus: (id: number, status: ChapterStatus): Promise<ChapterRow | null> =>
      ipcRenderer.invoke('chapters:setStatus', id, status),
    /** 特殊章置顶 / 置底（'top' | 'bottom'）；普通章 / 不存在返回 null */
    setPin: (id: number, pin: ChapterPin): Promise<ChapterRow | null> =>
      ipcRenderer.invoke('chapters:setPin', id, pin),
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('chapters:delete', id),
    reorder: (id: number, index: number): Promise<boolean> =>
      ipcRenderer.invoke('chapters:reorder', id, index),
    /** 跨卷移动（volumeId 必填，未分卷语义已移除） */
    move: (id: number, volumeId: number): Promise<boolean> =>
      ipcRenderer.invoke('chapters:move', id, volumeId),
    /** 读取该章全部段落（idx 升序；documents 域已废除，正文直接归属章节） */
    getParagraphs: (chapterId: number): Promise<ParagraphRow[]> =>
      ipcRenderer.invoke('chapters:getParagraphs', chapterId),
    /** 全量重写该章段落（idx 0..n-1）；入参非法 / 章不存在 / 超单篇上限返回 { ok: false } */
    saveParagraphs: (
      chapterId: number,
      paragraphs: Array<{ text: string; contentJson?: string | null }>
    ): Promise<{ ok: boolean; count?: number }> =>
      ipcRenderer.invoke('chapters:saveParagraphs', chapterId, paragraphs),
    stats: (bookId: string): Promise<ChapterStats> => ipcRenderer.invoke('chapters:stats', bookId),
    nextVolumeTitle: (bookId: string): Promise<string> =>
      ipcRenderer.invoke('chapters:nextVolumeTitle', bookId),
    /** 下一个默认章名（卷内独立编号）；达卷内上限返回空串 */
    nextChapterTitle: (bookId: string, volumeId: number): Promise<string> =>
      ipcRenderer.invoke('chapters:nextChapterTitle', bookId, volumeId),
    listDeleted: (bookId: string): Promise<DeletedContent> =>
      ipcRenderer.invoke('chapters:listDeleted', bookId),
    restore: (id: number): Promise<boolean> => ipcRenderer.invoke('chapters:restore', id),
    restoreVolume: (id: number): Promise<boolean> =>
      ipcRenderer.invoke('chapters:restoreVolume', id),
    purge: (id: number): Promise<boolean> => ipcRenderer.invoke('chapters:purge', id),
    purgeVolume: (id: number): Promise<boolean> => ipcRenderer.invoke('chapters:purgeVolume', id),
    purgeAllDeleted: (bookId: string): Promise<PurgeCounts> =>
      ipcRenderer.invoke('chapters:purgeAllDeleted', bookId),
    /** 搜索（本章 / 全书）：子串全表扫描，缓存 + 分页，返回一页命中 */
    search: (bookId: string, input: ChapterSearchInput): Promise<ChapterSearchPage> =>
      ipcRenderer.invoke('chapters:search', bookId, input),
    /** 单条替换（定位到具体段落 + 段内偏移）；过期命中返回 replaced=0 */
    replace: (bookId: string, input: ChapterReplaceInput): Promise<ChapterReplaceResult> =>
      ipcRenderer.invoke('chapters:replace', bookId, input),
    /** 替换全部（本章 / 全书）；返回替换命中总数 / 受影响章数 / 章 id */
    replaceAll: (bookId: string, input: ChapterReplaceAllInput): Promise<ChapterReplaceAllResult> =>
      ipcRenderer.invoke('chapters:replaceAll', bookId, input)
  },
  entities: {
    /** 旧实体表 CRUD（保留兼容；正文匹配链路已改用统一设定库） */
    list: (bookId: string): Promise<EntityRow[]> => ipcRenderer.invoke('entities:list', bookId),
    get: (id: number): Promise<EntityDetail | null> => ipcRenderer.invoke('entities:get', id),
    create: (input: CreateEntityInput): Promise<EntityDetail | null> =>
      ipcRenderer.invoke('entities:create', input),
    update: (id: number, patch: UpdateEntityPatch): Promise<EntityDetail | null> =>
      ipcRenderer.invoke('entities:update', id, patch),
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('entities:delete', id),
    /** 正文实体匹配：词表来自统一设定库主表（world_entities + world_aliases） */
    match: (bookId: string, text: string): Promise<EntityMatch[]> =>
      ipcRenderer.invoke('entities:match', bookId, text),
    /** 词表版本签名（统一设定库实体 / 别名变更即变） */
    revision: (bookId: string): Promise<string> => ipcRenderer.invoke('entities:revision', bookId)
  },
  /** 统一设定库：四域统一寻址（软删除）；含别名 / 长文本 / 标签 / 引用 / 境界体系 */
  worldEntity: worldEntityApi,
  /** 统一设定库：子类分类表（预设 23 条 + 用户自定义，软删除） */
  worldSubtype: worldSubtypeApi,
  /** 胶囊配色表（28 行：23 预设子类 + 5 模块兜底），全局只读 */
  chipColors: chipColorsApi,
  /** 图片域：大纲正文内嵌图片的二进制资源（按书隔离，删书级联删除） */
  images: {
    /** 写入一张图片（`bookId` = 归属书）；mime 白名单 / 20 MB 上限非法 → null */
    create: (bookId: string, mime: string, data: Uint8Array): Promise<ImageRow | null> =>
      ipcRenderer.invoke('images:create', bookId, mime, data),
    /** 按 id 取图片二进制（`data` 为 Uint8Array）；不存在 → null */
    get: (id: number): Promise<ImagePayload | null> => ipcRenderer.invoke('images:get', id),
    /** 物理删除图片；不清理正文内引用（悬空 id 由正文按缺图占位容忍） */
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('images:delete', id)
  },
  /** 大纲域：复用章节域统一卷池；条目结构为 outline_items；正文内联在 content_json */
  outline: {
    listVolumes: (bookId: string): Promise<OutlineVolumeRow[]> =>
      ipcRenderer.invoke('outline:listVolumes', bookId),
    list: (bookId: string): Promise<OutlineItemRow[]> => ipcRenderer.invoke('outline:list', bookId),
    /** 创建正文卷；name 缺省 →「新卷」；同事务建卷级大纲行（scope='volume'） */
    createVolume: (bookId: string, name?: string): Promise<OutlineVolumeRow | null> =>
      ipcRenderer.invoke('outline:createVolume', bookId, name),
    /** 重命名卷（改 title 名段） */
    renameVolume: (id: number, name: string): Promise<OutlineVolumeRow | null> =>
      ipcRenderer.invoke('outline:renameVolume', id, name),
    /** 软删除卷（级联软删其下条目 + 卷纲行） */
    deleteVolume: (id: number): Promise<boolean> => ipcRenderer.invoke('outline:deleteVolume', id),
    reorderVolume: (id: number, index: number): Promise<boolean> =>
      ipcRenderer.invoke('outline:reorderVolume', id, index),
    /** 创建条目；title 可空 = 纯自定义名、无编号；volumeId 为 null = 独立条目（置顶），
     *  为数字 = 挂到该书的正文卷或分组卷（volumes.kind ∈ ('normal','group')）下 */
    create: (
      bookId: string,
      volumeId: number | null,
      title?: string
    ): Promise<OutlineItemRow | null> =>
      ipcRenderer.invoke('outline:create', bookId, volumeId, title),
    /** 创建分组容器（落一行 volumes.kind='group'，其下不产生条目行）；title 可空 */
    createGroup: (bookId: string, title?: string): Promise<OutlineVolumeRow | null> =>
      ipcRenderer.invoke('outline:createGroup', bookId, title),
    /** 重命名条目（改 title） */
    rename: (id: number, title: string): Promise<OutlineItemRow | null> =>
      ipcRenderer.invoke('outline:rename', id, title),
    /** 软删除条目 */
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('outline:delete', id),
    reorder: (id: number, index: number): Promise<boolean> =>
      ipcRenderer.invoke('outline:reorder', id, index),
    /** 跨卷移动（移至目标卷末尾） */
    move: (id: number, volumeId: number): Promise<boolean> =>
      ipcRenderer.invoke('outline:move', id, volumeId),
    /** 读取正文（条目 / 卷纲通用）；不存在或已软删返回 null */
    getContent: (itemId: number): Promise<OutlineContentPayloadRow | null> =>
      ipcRenderer.invoke('outline:getContent', itemId),
    /** 按卷 id 读取该卷的卷级大纲行（scope='volume'）正文载荷；无 / 已软删 / 卷不存在 → null */
    getVolumeOutline: (volumeId: number): Promise<OutlineContentPayloadRow | null> =>
      ipcRenderer.invoke('outline:getVolumeOutline', volumeId),
    /** 保存正文：contentJson 非空须为合法 JSON 串（主进程复验）；空串/null = 清空；行不存在返回 false */
    saveContent: (itemId: number, contentJson: string | null, text: string): Promise<boolean> =>
      ipcRenderer.invoke('outline:saveContent', itemId, contentJson, text),
    /** 回收站内容（软删的卷与条目；条目含原归属卷名 volumeTitle） */
    listDeleted: (bookId: string): Promise<DeletedOutlineContent> =>
      ipcRenderer.invoke('outline:listDeleted', bookId),
    /** 还原条目（追加到所属卷末尾） */
    restore: (id: number): Promise<boolean> => ipcRenderer.invoke('outline:restore', id),
    /** 还原卷及其下软删条目 */
    restoreVolume: (id: number): Promise<boolean> =>
      ipcRenderer.invoke('outline:restoreVolume', id),
    /** 彻底删除条目 */
    purge: (id: number): Promise<boolean> => ipcRenderer.invoke('outline:purge', id),
    /** 彻底删除卷（含其下条目） */
    purgeVolume: (id: number): Promise<boolean> => ipcRenderer.invoke('outline:purgeVolume', id),
    /** 清空回收站 */
    purgeAllDeleted: (bookId: string): Promise<OutlinePurgeCounts> =>
      ipcRenderer.invoke('outline:purgeAllDeleted', bookId)
  },
  /** 剧情域：剧情线 → 场景节点两级结构（不复用章节 / 大纲表；仅 CRUD，无拖拽） */
  plot: {
    listLines: (bookId: string): Promise<PlotLineRow[]> =>
      ipcRenderer.invoke('plot:listLines', bookId),
    listScenes: (bookId: string): Promise<PlotSceneRow[]> =>
      ipcRenderer.invoke('plot:listScenes', bookId),
    /** 创建剧情线；name 缺省 →「新剧情线」；options 缺省取默认类型 + 首色 */
    createLine: (
      bookId: string,
      name?: string,
      options?: CreatePlotLineOptions
    ): Promise<PlotLineRow | null> => ipcRenderer.invoke('plot:createLine', bookId, name, options),
    renameLine: (id: number, name: string): Promise<PlotLineRow | null> =>
      ipcRenderer.invoke('plot:renameLine', id, name),
    /** 更新剧情线（名称 / 类型 / 颜色；仅覆盖提供的字段） */
    updateLine: (id: number, patch: UpdatePlotLinePatch): Promise<PlotLineRow | null> =>
      ipcRenderer.invoke('plot:updateLine', id, patch),
    /** 软删除剧情线（级联软删其下场景） */
    deleteLine: (id: number): Promise<boolean> => ipcRenderer.invoke('plot:deleteLine', id),
    /** 创建场景（lineId 须属同书剧情线） */
    createScene: (
      bookId: string,
      lineId: number,
      input?: CreatePlotSceneInput
    ): Promise<PlotSceneRow | null> =>
      ipcRenderer.invoke('plot:createScene', bookId, lineId, input),
    /** 更新场景（仅覆盖提供的字段） */
    updateScene: (id: number, patch: UpdatePlotScenePatch): Promise<PlotSceneRow | null> =>
      ipcRenderer.invoke('plot:updateScene', id, patch),
    /** 软删除场景 */
    deleteScene: (id: number): Promise<boolean> => ipcRenderer.invoke('plot:deleteScene', id),
    /** 读取场景的手动关联设定（统一设定库实体，含名称 / 类型） */
    listSceneEntities: (sceneId: number): Promise<PlotSceneEntityRow[]> =>
      ipcRenderer.invoke('plot:listSceneEntities', sceneId),
    /** 整体替换场景的关联设定；场景不存在 / 入参畸形 → null */
    setSceneEntities: (
      sceneId: number,
      rows: PlotSceneEntityInput[]
    ): Promise<PlotSceneEntityRow[] | null> =>
      ipcRenderer.invoke('plot:setSceneEntities', sceneId, rows)
  },
  /** 伏笔域：锚点快照（不存 paragraph_id）；本批仅数据层 / IPC，UI 后续批次接入 */
  foreshadow: {
    list: (bookId: string): Promise<ForeshadowRow[]> =>
      ipcRenderer.invoke('foreshadow:list', bookId),
    get: (id: number): Promise<ForeshadowRow | null> => ipcRenderer.invoke('foreshadow:get', id),
    create: (bookId: string, payload: ForeshadowCreatePayload): Promise<ForeshadowRow | null> =>
      ipcRenderer.invoke('foreshadow:create', bookId, payload),
    update: (id: number, patch: ForeshadowUpdatePatch): Promise<ForeshadowRow | null> =>
      ipcRenderer.invoke('foreshadow:update', id, patch),
    delete: (id: number): Promise<boolean> => ipcRenderer.invoke('foreshadow:delete', id),
    /** 按章节或大纲条目取锚定伏笔（章节 → 正文埋点 / 大纲 → 大纲埋点；优先 chapterId） */
    listByAnchor: (chapterId?: number, outlineItemId?: number): Promise<ForeshadowRow[]> =>
      ipcRenderer.invoke('foreshadow:listByAnchor', chapterId, outlineItemId),
    /** 锚点反查命中（同上匹配，回传命中槽位 `body` / `outline`） */
    listByAnchorHit: (chapterId?: number, outlineItemId?: number): Promise<ForeshadowAnchorHit[]> =>
      ipcRenderer.invoke('foreshadow:listByAnchorHit', chapterId, outlineItemId),
    /** 给伏笔补缺失的埋点槽位（槽位由锚点 kind 决定；槽位已占用以 `{ ok: false }` 返回） */
    attachAnchor: (id: number, anchor: ForeshadowAnchor): Promise<AttachForeshadowAnchorResult> =>
      ipcRenderer.invoke('foreshadow:attachAnchor', id, anchor),
    /** 回收点锚点反查（章节 / 大纲条目，两者都给时优先 chapterId） */
    listByRecoverAnchor: (chapterId?: number, outlineItemId?: number): Promise<ForeshadowRow[]> =>
      ipcRenderer.invoke('foreshadow:listByRecoverAnchor', chapterId, outlineItemId)
  },
  stats: {
    /** 全书累计有效字数 */
    totalWords: (): Promise<number> => ipcRenderer.invoke('stats:totalWords'),
    /** 今日写作字数（净增量，展示取 max(0, …)） */
    todayWords: (): Promise<number> => ipcRenderer.invoke('stats:todayWords'),
    /** 连续写作天数 */
    streakDays: (): Promise<number> => ipcRenderer.invoke('stats:streakDays'),
    /** 批量取全部书籍真实统计（键为 bookId） */
    bookStatsAll: (): Promise<Record<string, BookStats>> => ipcRenderer.invoke('stats:bookStatsAll')
  },
  /** 数据健康自检：启动时主进程跑一次并缓存，此处只读拉取（结构 / 外键 / 不变量 / 完整性） */
  diagnostics: {
    get: (): Promise<DiagnosticsReport> => ipcRenderer.invoke('diagnostics:get')
  },
  settings: {
    get: (key: string): Promise<string | null> => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string): Promise<boolean> =>
      ipcRenderer.invoke('settings:set', key, value),
    all: (): Promise<Record<string, string>> => ipcRenderer.invoke('settings:all'),
    remove: (key: string): Promise<boolean> => ipcRenderer.invoke('settings:delete', key)
  },
  /** AI 域：配置（仅掩码视图）/ 模型列表 / 连通性测试 / 流式对话 + 会话与消息 */
  ai: aiApi,
  /** 违禁词库：词表浏览 / 计数 / 检测用启用词 / 用户词导入（来源固定 user）/ 启停 / 删除 */
  cleanWords: cleanWordsApi,
  /** OneDrive 备份：授权 / 状态 / 手动备份 + 进度订阅（错误以结构化 code 回传） */
  onedrive: onedriveApi,
  titleBar: {
    setOverlay: (options: TitleBarOverlayOptions): Promise<boolean> =>
      ipcRenderer.invoke('window:titlebar:set-overlay', options)
  },
  windowMaterial: {
    /** 切换窗口系统材质（'acrylic' 开透明 / 'none' 关）；返回实际生效值（不支持时降级 'none'） */
    set: (material: 'acrylic' | 'none'): Promise<'acrylic' | 'none' | null> =>
      ipcRenderer.invoke('window:setMaterial', material),
    /** 当前系统是否支持 Acrylic（Electron 限制：仅 Windows 11 22H2+） */
    acrylicSupported: (): Promise<boolean> => ipcRenderer.invoke('window:acrylicSupported')
  },
  windowSnap: {
    /** 开启宽度磁吸并上报配置，非法配置主进程返回 false */
    set: (config: SnapConfig): Promise<boolean> => ipcRenderer.invoke('window:snap:set', config),
    /** 关闭磁吸（离开书籍页时调用） */
    clear: (): Promise<boolean> => ipcRenderer.invoke('window:snap:clear'),
    /** 读取当前吸附状态 */
    status: (): Promise<SnapStatus | null> => ipcRenderer.invoke('window:snap:status'),
    /** 当前窗口外宽（DIP），供渲染层计算 overhead */
    boundsWidth: (): Promise<number> => ipcRenderer.invoke('window:bounds:get')
  },
  systemTheme: {
    /** 读取系统强调色，已解析为 `#rrggbb`；系统不支持 / 读取失败时为 null */
    getAccentColor: (): Promise<string | null> => ipcRenderer.invoke('theme:accent:get'),
    /** 订阅系统强调色变化，返回取消订阅函数（内部 removeListener，不暴露 ipcRenderer） */
    onAccentChange: (callback: (color: string | null) => void): (() => void) => {
      const listener = (_event: IpcRendererEvent, color: string | null): void => callback(color)
      ipcRenderer.on('theme:accent:changed', listener)
      return () => {
        ipcRenderer.removeListener('theme:accent:changed', listener)
      }
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
