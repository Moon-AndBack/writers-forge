/**
 * 数据健康自检命名空间（`diagnostics`）：启动后「数据健康检查」弹窗的标题、汇总与
 * 逐条问题文案。
 *
 * 与主进程问题码**一一对应**（`src/main/database/diagnostics/types.ts` 的
 * `DiagnosticsIssueCode`）：每个码对应 `issue.<code>.title` + `issue.<code>.detail`
 * 两个叶子。渲染层以模板字面量 `` t(`issue.${code}.title`) `` 取用，故**新增 / 删除
 * 问题码必须同步双端本文件**（缺 key / 多 key 会在 `npm run typecheck:web` 报错）。
 *
 * 插值参数（均为语言中立数据，见各 issue 的 params 形状）：
 * - `{{n}}`：同类问题的命中总数（用 `n` 而非 `count`，避免触发 i18next 复数语义）
 * - `{{items}}`：前若干标识（表 / 索引名、`子表#rowid`、卷 / 章 id 等），超限以 `…` 截断
 * - `{{table}}` / `{{parent}}`：单表定位（缺失表名 / 被引用的父表名）
 */
const diagnostics = {
  dialog: {
    title: '数据健康检查',
    summary: '检测到 {{n}} 项数据问题',
    checkedAt: '检查时间：{{time}}',
    hint: '这些问题不影响应用启动，但可能影响数据完整性。建议先备份应用数据目录，再按下方清单处理。',
    dismiss: '我知道了'
  },
  issue: {
    structure: {
      missingTable: {
        title: '缺少数据表：{{table}}',
        detail: '设计结构中的表「{{table}}」不存在，相关功能的数据无法读取。'
      },
      extraTable: {
        title: '存在 {{n}} 个多余的数据表',
        detail: '以下表不在设计结构中，可能来自旧版本或被外部工具创建：{{items}}'
      },
      missingColumn: {
        title: '表 {{table}} 缺少 {{n}} 个列',
        detail: '缺失列：{{items}}'
      },
      extraColumn: {
        title: '表 {{table}} 存在 {{n}} 个多余的列',
        detail: '多余列：{{items}}（可能来自旧版本残留，如 volumes.has_outline）'
      },
      missingIndex: {
        title: '缺少 {{n}} 个索引',
        detail: '缺失索引：{{items}}'
      },
      extraIndex: {
        title: '存在 {{n}} 个多余的索引',
        detail: '多余索引：{{items}}'
      }
    },
    foreignKey: {
      orphan: {
        title: '存在 {{n}} 条悬空外键（父表 {{parent}}）',
        detail: '这些行引用了不存在的父行：{{items}}'
      }
    },
    invariant: {
      volumeWithoutOutline: {
        title: '有 {{n}} 个卷缺少卷纲',
        detail: '每个卷都应有一条卷级大纲；以下卷缺失：{{items}}'
      },
      duplicateVolumeOutline: {
        title: '有 {{n}} 个卷存在重复的卷纲',
        detail: '每个卷至多一条卷纲；以下卷（含重复条数）超出：{{items}}'
      },
      chapterInGroupVolume: {
        title: '有 {{n}} 个章节被放在分组容器卷下',
        detail: '分组容器只在大纲页可见、不能挂章节；以下章节异常：{{items}}'
      },
      specialChapterMissingPrefix: {
        title: '有 {{n}} 个特殊章缺少前段或名称',
        detail: '特殊章必须同时具备前段（如「序章」）与非空名称；以下章节异常：{{items}}'
      },
      normalChapterPinned: {
        title: '有 {{n}} 个普通章被错误置顶 / 置底',
        detail: '只有特殊章可以置顶 / 置底；以下章节异常：{{items}}'
      },
      specialChapterInCustomVolume: {
        title: '有 {{n}} 个特殊章位于自定义卷中',
        detail: '自定义卷内不允许特殊章；以下章节异常：{{items}}'
      },
      outlineItemConsistency: {
        title: '有 {{n}} 条大纲条目的类型与归属不一致',
        detail:
          '条目类型（独立 / 卷下）与卷归属必须匹配；以下条目异常（格式：id（类型 / 用途 / 卷））：{{items}}'
      }
    },
    world: {
      orphanChild: {
        title: '存在 {{n}} 条孤立的设定子表记录',
        detail: '这些子表行找不到对应的设定主行（格式：表#rowid）：{{items}}'
      },
      entityChildMismatch: {
        title: '有 {{n}} 条设定的类型与子表记录不一致',
        detail:
          '设定类型应与子表行一一对应（角色 / 境界体系）；以下条目异常（格式：id（类型））：{{items}}'
      },
      selfRelation: {
        title: '存在 {{n}} 条自反关系',
        detail: '关系两端指向同一条记录没有意义；以下行异常（格式：表#rowid）：{{items}}'
      }
    },
    plot: {
      sceneEntityOrphan: {
        title: '有 {{n}} 条剧情场景关联悬空',
        detail: '这些场景设定关联找不到对应的场景或设定（格式：表#rowid）：{{items}}'
      }
    },
    integrity: {
      corrupt: {
        title: '数据库文件完整性检查未通过',
        detail: 'SQLite 报告了以下问题，建议尽快备份并考虑从备份恢复：{{items}}'
      }
    },
    diagnostics: {
      checkFailed: {
        title: '数据自检未能完整完成',
        detail: '已完成 {{n}} 项检查后中断，结果可能不完整；详情见应用日志。'
      },
      internalError: {
        title: '数据自检无法启动',
        detail: '自检在开始时就失败，数据库可能不可用；详情见应用日志。'
      }
    }
  }
}

export default diagnostics
