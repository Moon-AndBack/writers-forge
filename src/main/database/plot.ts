/**
 * 剧情域（剧情线 → 场景节点）：数据访问实现，风格对齐 `outline.ts`。
 *
 * 与章节域 / 大纲域的关键差异：
 * - **独立表**：`plot_lines` / `plot_scenes`，不复用章节表、不走大纲卷章结构；
 * - **无特殊卷 / 特殊章、无编号、无 pin / status / document 关联**：剧情线仅名称，
 *   场景节点为自由文本（时间 / 标题 / 描述 / 出场人物）；
 * - **两级结构**：场景节点 `line_id` 必属于同一本书的某条剧情线；
 * - **场景正文富文本化**（与大纲正文同口径，见 `database/richText`）：`description` 保留为
 *   **派生纯文本摘要**（字数 / 搜索 / 卡片摘要真源），`description_json` 存**整条块级 Tiptap
 *   JSON**（`null` = 空正文）。写入时两列**恒同步**（见 `resolveSceneDescription`）；
 *   老库纯文本经一次性迁移包成合法富文本（`database/index.ts` 的 `migratePlotSceneDescriptionRich`）。
 * - **无出场人物列**：出场实体由剧情正文**自动匹配实体**（`entities:match`）生成胶囊，
 *   实时且**不落库**，故本域不存 `characters`（老库残留列经
 *   `database/index.ts` 的 `migratePlotScenesDropCharacters` 一次性删除）。
 *
 * 软删除口径（对齐章节域 / 大纲域）：删线 / 删场景均**软删**（置 `deleted_at`），
 * 不物理删除；删线会级联软删其下未删除场景。本批不含回收站模块，软删行对查询不可见。
 */

/**
 * 本文件为 barrel（对齐 `worldEntities.ts` 的拆分范式，外部导入路径零改动）：
 * - `plotShared.ts`：类型 / 常量 / 纯函数辅助（按其原有公开面重导出）；
 * - `plotLines.ts`：剧情线读写；
 * - `plotScenes.ts`：场景节点读写。
 */

export * from './plotLines'
export * from './plotScenes'
export {
  DEFAULT_PLOT_LINE_COLOR,
  DEFAULT_PLOT_LINE_TYPE,
  PLOT_LINE_COLORS,
  PLOT_LINE_TYPES,
  normalizePlotLineColor,
  normalizePlotLineType,
  parseTimelineOrigin
} from './plotShared'
export type {
  CreatePlotLineOptions,
  CreatePlotSceneInput,
  PlotLineColorOption,
  PlotLineRow,
  PlotLineType,
  PlotSceneRow,
  UpdatePlotLinePatch,
  UpdatePlotScenePatch
} from './plotShared'
