import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, useToast } from '../../../components/ui'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import EntityShortRichTextField from '../entities/EntityShortRichTextField'
import SaveBar from '../SaveBar'
import {
  parseTimelineList,
  resolveActiveEntry,
  resolveEntryDescriptionJson,
  timelineActiveKey,
  timelineListKey
} from './timelineOrigin'
import type { TimelineOriginPatch } from './useTimelineWorkspace'

/** 空正文归一值（与 `useRichTextBodyEditor` 同口径；模块级常量保证引用稳定）。 */
const EMPTY_VALUE: RichTextBodyValue = { text: '', json: null }

export interface TimelineOriginPanelProps {
  /** 书籍 id（路由参数）；按书读取 `timeline:list:<bookId>`。 */
  bookId?: string
  /** 是否启用实体悬停卡（默认 `true`；右栏面板统一委托时传 `false`）。 */
  hoverCard?: boolean
  /** 当前选中时间线 id；切换时重新读取对应条目的起点名与描述。 */
  activeTimelineId?: string | null
  /** 保存起点补丁（页面层 `useTimelineWorkspace.updateOrigin`；返回是否落库成功）。 */
  onSaveOrigin: (patch: TimelineOriginPatch) => Promise<boolean>
  /**
   * 关闭前统一 flush 入口：本卡挂载期间写入「补存当前草稿」回调（无脏内容为空操作）。
   * 与章节 / 大纲的 flushRef 同款，供 `useFlushAllModules` 聚合调用。
   */
  flushRef?: RefObject<(() => Promise<void>) | null>
}

/**
 * 独立时间线右栏「起点」区（卡头卡 + 内容卡）：读写**当前选中时间线**的起点名与描述。
 *
 * - 起点时间（年份 0 / 「元年」）固定不可编辑，本卡不展示时间行；
 * - 卡头即起点名输入框（常驻 `Input size="md"`，38px），文字直接输入；
 * - 数据按 `bookId` 定位 `timeline:list:<bookId>`，再以 `activeTimelineId` 选中条目；
 * - 保存口径与其它右栏一致：名字与描述都只改本地草稿，**点卡外底部 `SaveBar` 的保存按钮**
 *   才合并为一次 `settings.set` 落库（不做失焦 / 回车自动保存）；
 * - 脏态基线（`storedJson` / `storedName`）与 `initialJson` 同走条目字段：老数据
 *   （只有纯文本）首帧也不会假 dirty；名字比较两侧都 trim，首尾空白不产生假脏；
 * - 关闭前 / 切模块统一 flush：未保存草稿由本卡注册的补存回调落库（无脏内容为空操作）；
 * - 描述为空时字段仅显示占位示例，落库仍为空串 / `null`。
 */
export default function TimelineOriginPanel({
  bookId,
  hoverCard = true,
  activeTimelineId,
  onSaveOrigin,
  flushRef
}: TimelineOriginPanelProps) {
  const { t } = useTranslation('timeline')
  const { t: tCommon } = useTranslation('common')
  // 常驻草稿名：卡头输入框直接绑定，随底部保存条一起提交。
  const [draftName, setDraftName] = useState('')
  const { show: showToast, node: toastNode } = useToast()
  // 富文本初始正文只在挂载时读取一次（外层按 `bookId + activeTimelineId` 重建即回退草稿）。
  const [initialJson, setInitialJson] = useState<string | null>(null)
  const [draft, setDraft] = useState<RichTextBodyValue>(EMPTY_VALUE)
  /** 已落库基线（归一 JSON 串；空正文 = `''`）。 */
  const [storedJson, setStoredJson] = useState('')
  /** 已落库的起点名基线（与输入框草稿比对；两侧 trim）。 */
  const [storedName, setStoredName] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  // 同步守卫：按钮连点 / flush 可能背靠背触发，state 尚未重渲染时也能拦住第二次写入。
  const savingRef = useRef(false)
  // 关闭前 flush 用的最新态镜像（state 异步更新，flush 需读到已落库值与当前草稿）。
  const draftRef = useRef<RichTextBodyValue>(EMPTY_VALUE)
  const draftNameRef = useRef('')
  const storedRef = useRef('')
  const storedNameRef = useRef('')
  const loadedRef = useRef(false)
  const inFlightSaveRef = useRef<Promise<void> | null>(null)
  const handleSaveRef = useRef<() => Promise<void>>(async () => undefined)

  const listKey = timelineListKey(bookId)
  const activeKey = timelineActiveKey(bookId)

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.api?.settings.get(listKey), window.api?.settings.get(activeKey)])
      .then(([listRaw, storedActive]) => {
        if (cancelled) return
        const list = parseTimelineList(listRaw ?? null)
        const entry = resolveActiveEntry(list, activeTimelineId ?? storedActive ?? null)
        // 基线必须与 `initialJson` 走同一兜底函数（老数据只有纯文本 → 派生成文档），
        // 否则草稿与落库基线不同源，首帧就会假 dirty。
        const baseline = entry === null ? null : resolveEntryDescriptionJson(entry)
        const baselineText = entry?.description ?? ''
        const baselineName = entry?.originName ?? ''
        setInitialJson(baseline)
        setStoredJson(baseline ?? '')
        storedRef.current = baseline ?? ''
        setDraft({ text: baselineText, json: baseline })
        draftRef.current = { text: baselineText, json: baseline }
        setDraftName(baselineName)
        draftNameRef.current = baselineName
        setStoredName(baselineName)
        storedNameRef.current = baselineName
        loadedRef.current = true
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setInitialJson(null)
        setStoredJson('')
        storedRef.current = ''
        setDraft(EMPTY_VALUE)
        draftRef.current = EMPTY_VALUE
        setDraftName('')
        draftNameRef.current = ''
        setStoredName('')
        storedNameRef.current = ''
        loadedRef.current = true
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, listKey, activeKey, activeTimelineId])

  // 脏态：名字两侧都 trim（老数据首尾空白不产生假脏）+ 描述比较归一 JSON 串
  // （空正文视为 `''`，`null` / `''` 不因表示差异误判）。
  const nameDirty = loaded && draftName.trim() !== storedName.trim()
  const jsonDirty = loaded && (draft.json ?? '') !== storedJson
  const dirty = nameDirty || jsonDirty

  const handleSave = useCallback(async (): Promise<void> => {
    if (!loadedRef.current || savingRef.current) return
    const nextName = draftNameRef.current.trim()
    const nextJson = draftRef.current.json ?? ''
    const nameChanged = nextName !== storedNameRef.current.trim()
    const jsonChanged = nextJson !== storedRef.current
    if (!nameChanged && !jsonChanged) return
    // 只把实际变更的字段放进补丁，页面层合并为一次 `settings.set`。
    const patch: TimelineOriginPatch = {}
    if (nameChanged) patch.originName = nextName
    if (jsonChanged) patch.description = draftRef.current
    savingRef.current = true
    setSaving(true)
    // 在途任务自身吞掉落库失败与异常（统一 toast），保证 `flushSave` await 到的
    // promise 不会 reject；`finally` 必定复位保存态并清空在途引用。
    const task = (async (): Promise<void> => {
      try {
        const ok = await onSaveOrigin(patch)
        if (!ok) {
          showToast(tCommon('saveFailed'))
          return
        }
        // 保存成功不回写输入框（避免光标跳动），只推进基线。
        if (nameChanged) {
          storedNameRef.current = nextName
          setStoredName(nextName)
        }
        if (jsonChanged) {
          storedRef.current = nextJson
          setStoredJson(nextJson)
        }
      } catch {
        // 同步抛出 / Promise reject 与返回 false 走同一条失败提示；基线不前进。
        showToast(tCommon('saveFailed'))
      } finally {
        inFlightSaveRef.current = null
        savingRef.current = false
        setSaving(false)
      }
    })()
    inFlightSaveRef.current = task
    // 兜底：若 `onSaveOrigin` 同步抛异常，内部 `finally` 会先于上面的赋值执行，
    // 这里按引用一致再清一次，避免残留已结束的任务。
    await task
    if (inFlightSaveRef.current === task) inFlightSaveRef.current = null
  }, [onSaveOrigin, showToast, tCommon])

  // 每次渲染刷新 flush 用的保存入口（闭包捕获最新落库值 / 保存函数）。
  useEffect(() => {
    handleSaveRef.current = handleSave
  })

  // 关闭前 flush：先等在途保存结束，再按最新草稿与已落库基线判定是否补存。
  // 无脏内容 / 未加载 / 已与落库值一致时为空操作（幂等，不重复写）。
  const flushSave = useCallback(async (): Promise<void> => {
    // 在途保存的失败 / 异常已由 `handleSave` 内部提示；此处兜底吞掉，保证 flush 链
    // 不中断，后续仍按最新草稿与基线比对（必要时补存）。
    if (inFlightSaveRef.current) {
      try {
        await inFlightSaveRef.current
      } catch {
        // 忽略：保存态已由 `handleSave` 的 finally 复位。
      }
    }
    if (!loadedRef.current) return
    const nameChanged = draftNameRef.current.trim() !== storedNameRef.current.trim()
    const jsonChanged = (draftRef.current.json ?? '') !== storedRef.current
    if (!nameChanged && !jsonChanged) return
    await handleSaveRef.current()
  }, [])

  useEffect(() => {
    if (!flushRef) return
    flushRef.current = flushSave
    return () => {
      flushRef.current = null
    }
  }, [flushRef, flushSave])

  return (
    <>
      {/* 卡头：与下方起点内容区同款字段底座（section 自身承担底色 / 透明边 /
          圆角 / 10×12 内衬），内部输入框透明化，视觉边界只由 section 一层承担。 */}
      <section className="timeline-origin-head" aria-label={t('originNameLabel')}>
        <Input
          size="md"
          value={draftName}
          onChange={(event) => {
            draftNameRef.current = event.target.value
            setDraftName(event.target.value)
          }}
          placeholder={t('originTitle')}
          aria-label={t('originNameLabel')}
          spellCheck={false}
          autoComplete="off"
          disabled={!loaded}
        />
      </section>
      {/* 内容卡：字段自身即输入框根（section），`aria-label` + 占位符承载可读提示。
          首读完成后再挂字段（`initialJson` 只在挂载时读取一次）；未完成时用同宽空
          section 占位，避免 SaveBar 上移跳动。 */}
      {loaded ? (
        <EntityShortRichTextField
          as="section"
          className="timeline-origin-card"
          bookId={bookId ?? ''}
          hoverCard={hoverCard}
          initialJson={initialJson}
          onChange={(value) => {
            draftRef.current = value
            setDraft(value)
          }}
          placeholder={t('originPlaceholder')}
          ariaLabel={t('originDescLabel')}
          fill
        />
      ) : (
        <section className="timeline-origin-card" aria-hidden="true" />
      )}
      <SaveBar
        className="timeline-save-bar"
        dirty={dirty}
        saving={saving}
        onSave={() => {
          void handleSave()
        }}
      />
      {toastNode}
    </>
  )
}
