/**
 * 设定档案写动作装配（自 `useDossierWorkspace.ts` 拆出，§3 ≤500 行）：
 * 新建 / 更新 / 删除 / 按子类删除 + 关系增删改。
 *
 * 写操作串行化：右栏「失焦提交 / 关系增删」可能先后触发，用 promise 链保证落库顺序。
 * 依赖（`reload` / `flushDraft` / 写后回填）一律由组合层**显式传入**，不靠闭包捕获，
 * 避免写链拿到旧的 `active`（切域后写回旧域）。
 */
import { useCallback, useRef } from 'react'
import { createLogger } from '@renderer/lib/log'
import { clearEntityDetailCache } from '../entities/entityDetailCache'
import {
  MODULE_ENTITY_TYPE,
  type DossierCreateInput,
  type DossierModule,
  type DossierRelationInput,
  type DossierRelationPatch,
  type DossierRow,
  type DossierUpdatePatch
} from './dossierTree'
import type { DossierSelectionApi } from './useDossierSelection'

/** 设定档案装配日志（转发至主进程落盘）。 */
const log = createLogger('dossier')

/** 写后本地状态回填：列表行 + 选中 / 详情 / 关系（组合层拼装，写动作不直接持 setter）。 */
export interface DossierWriteBack extends DossierSelectionApi {
  /** 就地替换当前域的列表行（保留行上既有关系摘要）。 */
  patchRow: (module: DossierModule, id: number, updated: DossierRow) => void
}

export interface DossierMutationsOptions {
  /** 当前域（非设定档案五域时为 null）。 */
  active: DossierModule | null
  /** 当前书籍 id（写入需要；空串表示未选书）。 */
  bookId: string
  /** 当前域列表（按子类批量删除用）。 */
  currentRows: DossierRow[]
  /** 重新拉取列表（组合层提供）。 */
  reload: () => Promise<void>
  /** 立即落库当前草稿（有脏才写；新建前调用）。 */
  flushDraft: () => Promise<void>
  /** 写后本地状态回填。 */
  writeBack: DossierWriteBack
}

export interface DossierMutations {
  create: (input: DossierCreateInput) => Promise<number | null>
  update: (id: number, patch: DossierUpdatePatch) => Promise<void>
  remove: (id: number) => Promise<void>
  deleteBySubType: (subtypeId: number) => Promise<void>
  addRelation: (id: number, input: DossierRelationInput) => Promise<void>
  updateRelation: (id: number, refId: number, patch: DossierRelationPatch) => Promise<void>
  removeRelation: (id: number, refId: number) => Promise<void>
}

export function useDossierMutations({
  active,
  bookId,
  currentRows,
  reload,
  flushDraft,
  writeBack
}: DossierMutationsOptions): DossierMutations {
  // 写操作串行化：右栏「失焦提交 / 关系增删」可能先后触发，用 promise 链保证落库顺序。
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())

  const create = useCallback(
    async (input: DossierCreateInput): Promise<number | null> => {
      if (!active || bookId === '') return null
      // 新建成功会切换选中，右栏表单随之重建：有未保存草稿先落库，避免丢字。
      await flushDraft()
      const api = window.api?.worldEntity
      if (!api) return null
      const name = input.name.trim()
      if (name === '') return null
      try {
        const created = await api.create({
          bookId,
          entityType: MODULE_ENTITY_TYPE[active],
          name,
          // 角色 / 境界体系不传分类，由主进程自动补默认预设分类；null 不再下传。
          ...(input.subtypeId != null ? { subtypeId: input.subtypeId } : {})
        })
        if (created === null) {
          log.warn('新建设定档案未落库（主进程守卫回 null）', { module: active, bookId })
          return null
        }
        writeBack.seedDetail(active, created)
        await reload()
        writeBack.markSelected(active, created.id)
        return created.id
      } catch (error) {
        log.warn('新建设定档案失败', error)
        return null
      }
    },
    [active, bookId, reload, flushDraft, writeBack]
  )

  /** 重新拉取当前行出边 / 入边引用，并同步到详情态。 */
  const reloadRelations = useCallback(
    async (id: number): Promise<void> => {
      if (!active) return
      const api = window.api?.worldEntity
      if (!api) return
      const [refs, incoming] = await Promise.all([api.listRefs(id), api.listIncomingRefs(id)])
      writeBack.patchRelations(active, id, refs, incoming)
    },
    [active, writeBack]
  )

  const update = useCallback(
    async (id: number, patch: DossierUpdatePatch): Promise<void> => {
      if (!active) return
      const api = window.api?.worldEntity
      if (!api) return
      writeChainRef.current = writeChainRef.current.then(async () => {
        try {
          const updated = await api.update(id, patch)
          if (!updated) return
          // 改名 / 别名 / 子类会污染对端缓存里的关系标签快照（targetName / peerPresetKey），整体失效。
          clearEntityDetailCache()
          // 详情不携带列表关系摘要（见 `WorldEntityRow.relations`），沿用行上既有摘要。
          writeBack.patchRow(active, id, updated)
          writeBack.patchDetail(active, updated)
        } catch (error) {
          log.warn('更新设定档案失败', error)
        }
      })
      return writeChainRef.current
    },
    [active, writeBack]
  )

  const remove = useCallback(
    async (id: number): Promise<void> => {
      if (!active) return
      const api = window.api?.worldEntity
      if (!api) return
      try {
        await api.delete(id)
        // 选中被删后由派生口径自动回退首行；详情随 `activeId` 变化重载。
        writeBack.dropSelected(active, id)
        await reload()
      } catch (error) {
        log.warn('删除设定档案失败', error)
      }
    },
    [active, reload, writeBack]
  )

  const deleteBySubType = useCallback(
    async (subtypeId: number): Promise<void> => {
      if (!active || bookId === '') return
      const api = window.api?.worldEntity
      if (!api) return
      const targets = currentRows.filter((row) => row.subtypeId === subtypeId)
      try {
        for (const row of targets) {
          await api.delete(row.id)
        }
      } catch (error) {
        log.warn('删除分类失败', error)
      } finally {
        await reload() // 中途失败也要刷新，避免已删实体的缓存残留。
      }
    },
    [active, bookId, currentRows, reload]
  )

  const addRelation = useCallback(
    async (id: number, input: DossierRelationInput): Promise<void> => {
      if (!active || bookId === '') return
      const api = window.api?.worldEntity
      if (!api) return
      writeChainRef.current = writeChainRef.current.then(async () => {
        try {
          // 角色 → 物品自动反向：恒写「物品属于角色」（from = 物品、to = 角色），
          // 使物品卡片的出边与角色卡片的入边都能看到这条关系。
          const fromId = input.reverse ? input.targetId : id
          const toId = input.reverse ? id : input.targetId
          await api.addRef({
            bookId,
            fromId,
            toId,
            semanticCode: input.semanticCode,
            // 补充说明（role）已从交互下线：固定写空串，老库存量值不再展示 / 编辑。
            role: '',
            note: input.note ?? ''
          })
          await reloadRelations(id)
          // 卡片底部关系摘要来自列表行：写后刷新列表，避免摘要停在旧值
          //（反向写只刷新当前实体行的摘要，目标卡片为「属于」的源端，摘要在其所属模块下次加载时更新）。
          await reload()
        } catch (error) {
          log.warn('新增关系失败', error)
        }
      })
      return writeChainRef.current
    },
    [active, bookId, reloadRelations, reload]
  )

  const updateRelation = useCallback(
    async (id: number, refId: number, patch: DossierRelationPatch): Promise<void> => {
      if (!active) return
      const api = window.api?.worldEntity
      if (!api) return
      writeChainRef.current = writeChainRef.current.then(async () => {
        try {
          await api.updateRef(refId, patch)
          await reloadRelations(id)
          await reload()
        } catch (error) {
          log.warn('更新关系失败', error)
        }
      })
      return writeChainRef.current
    },
    [active, reloadRelations, reload]
  )

  const removeRelation = useCallback(
    async (id: number, refId: number): Promise<void> => {
      if (!active) return
      const api = window.api?.worldEntity
      if (!api) return
      writeChainRef.current = writeChainRef.current.then(async () => {
        try {
          await api.removeRef(refId)
          await reloadRelations(id)
          await reload()
        } catch (error) {
          log.warn('删除关系失败', error)
        }
      })
      return writeChainRef.current
    },
    [active, reloadRelations, reload]
  )

  return {
    create,
    update,
    remove,
    deleteBySubType,
    addRelation,
    updateRelation,
    removeRelation
  }
}
