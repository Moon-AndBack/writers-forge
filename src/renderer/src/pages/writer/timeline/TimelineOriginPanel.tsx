import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { IconButton, useToast } from '../../../components/ui'
import type { RichTextBodyValue } from '../../../components/editor/useRichTextBodyEditor'
import EntityShortRichTextField from '../entities/EntityShortRichTextField'
import { PencilIcon } from '../icons'
import SaveBar from '../SaveBar'
import {
  parseTimelineList,
  resolveActiveEntry,
  resolveEntryDescriptionJson,
  timelineActiveKey,
  timelineListKey
} from './timelineOrigin'

/** 空正文归一值（与 `useRichTextBodyEditor` 同口径；模块级常量保证引用稳定）。 */
const EMPTY_VALUE: RichTextBodyValue = { text: '', json: null }

export interface TimelineOriginPanelProps {
  /** 书籍 id（路由参数）；按书读取 `timeline:list:<bookId>`。 */
  bookId?: string
  /** 是否启用实体悬停卡（默认 `true`；右栏面板统一委托时传 `false`）。 */
  hoverCard?: boolean
  /** 当前选中时间线 id；切换时重新读取对应条目的描述。 */
  activeTimelineId?: string | null
  /** 起点卡片标题（页面层派生；空串 → 展示回退「起点」）。 */
  originName?: string
  /** 重命名起点卡片标题（页面层 `useTimelineWorkspace.renameOrigin`；返回是否落库成功）。 */
  onRenameOrigin?: (name: string) => Promise<boolean>
  /** 写回当前选中时间线的起点描述（页面层 `updateDescription`，入参为编辑器归一值）。 */
  onSaveDescription: (value: RichTextBodyValue) => Promise<boolean>
  /**
   * 关闭前统一 flush 入口：本卡挂载期间写入「补存当前草稿」回调（无脏内容为空操作）。
   * 与章节 / 大纲的 flushRef 同款，供 `useFlushAllModules` 聚合调用。
   */
  flushRef?: RefObject<(() => Promise<void>) | null>
}

/**
 * 独立时间线右栏「起点」区（卡头卡 + 内容卡）：读写**当前选中时间线**的起点描述（富文本）。
 *
 * - 起点时间（年份 0 / 「元年」）固定不可编辑，本卡不展示时间行，只有描述字段；
 * - 数据按 `bookId` 定位 `timeline:list:<bookId>`，再以 `activeTimelineId` 选中条目；
 * - 保存口径与其它右栏一致：字段只改本地草稿，**点卡外底部 `SaveBar` 的保存按钮**才落库
 *   （不做失焦自动保存）；
 * - 脏态基线（`storedJson`）与 `initialJson` 同走 `resolveEntryDescriptionJson`：老数据
 *   （只有纯文本）首帧也不会假 dirty；
 * - 关闭前 / 切模块统一 flush：未保存草稿由本卡注册的补存回调落库（无脏内容为空操作）；
 * - 描述为空时字段仅显示占位示例，落库仍为空串 / `null`。
 */
export default function TimelineOriginPanel({
  bookId,
  hoverCard = true,
  activeTimelineId,
  originName = '',
  onRenameOrigin,
  onSaveDescription,
  flushRef
}: TimelineOriginPanelProps) {
  const { t } = useTranslation('timeline')
  // 起点卡头行内改名态：草稿名 + 结算标记（Enter / Esc 后阻止随后 blur 二次提交）。
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  const renameSettled = useRef(false)
  const { show: showToast, node: toastNode } = useToast()
  // 富文本初始正文只在挂载时读取一次（外层按 `bookId + activeTimelineId` 重建即回退草稿）。
  const [initialJson, setInitialJson] = useState<string | null>(null)
  const [draft, setDraft] = useState<RichTextBodyValue>(EMPTY_VALUE)
  /** 已落库基线（归一 JSON 串；空正文 = `''`）。 */
  const [storedJson, setStoredJson] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  // 同步守卫：按钮连点 / flush 可能背靠背触发，state 尚未重渲染时也能拦住第二次写入。
  const savingRef = useRef(false)
  // 关闭前 flush 用的最新态镜像（state 异步更新，flush 需读到已落库值与当前草稿）。
  const draftRef = useRef<RichTextBodyValue>(EMPTY_VALUE)
  const storedRef = useRef('')
  const loadedRef = useRef(false)
  const inFlightSaveRef = useRef<Promise<boolean> | null>(null)
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
        setInitialJson(baseline)
        setStoredJson(baseline ?? '')
        storedRef.current = baseline ?? ''
        setDraft({ text: baselineText, json: baseline })
        draftRef.current = { text: baselineText, json: baseline }
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
        loadedRef.current = true
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [bookId, listKey, activeKey, activeTimelineId])

  // 脏态比较**归一 JSON 串**（空正文视为 `''`）：`null` / `''` 不因表示差异误判。
  const dirty = loaded && (draft.json ?? '') !== storedJson

  const handleSave = useCallback(async (): Promise<void> => {
    if (!loadedRef.current || savingRef.current) return
    const value = draftRef.current
    const nextJson = value.json ?? ''
    if (nextJson === storedRef.current) return
    savingRef.current = true
    setSaving(true)
    const task = onSaveDescription(value)
    inFlightSaveRef.current = task
    const ok = await task
    inFlightSaveRef.current = null
    savingRef.current = false
    setSaving(false)
    if (!ok) return
    storedRef.current = nextJson
    setStoredJson(nextJson)
  }, [onSaveDescription])

  // 每次渲染刷新 flush 用的保存入口（闭包捕获最新落库值 / 保存函数）。
  useEffect(() => {
    handleSaveRef.current = handleSave
  })

  // 关闭前 flush：先等在途保存结束，再按最新草稿与已落库基线判定是否补存。
  // 无脏内容 / 未加载 / 已与落库值一致时为空操作（幂等，不重复写）。
  const flushSave = useCallback(async (): Promise<void> => {
    if (inFlightSaveRef.current) await inFlightSaveRef.current
    if (!loadedRef.current) return
    if ((draftRef.current.json ?? '') === storedRef.current) return
    await handleSaveRef.current()
  }, [])

  useEffect(() => {
    if (!flushRef) return
    flushRef.current = flushSave
    return () => {
      flushRef.current = null
    }
  }, [flushRef, flushSave])

  // 卡头标题：自定义名 trim 后为空 → 回退 i18n「起点」。
  const displayName = originName.trim() !== '' ? originName : t('originTitle')

  const beginRename = (): void => {
    setDraftName(originName)
    setRenaming(true)
    renameSettled.current = false
  }

  // 结算改名：Enter / 失焦提交，Esc 取消；空名落空串（展示层回退「起点」）。
  const settleRename = (commit: boolean): void => {
    if (renameSettled.current) return
    renameSettled.current = true
    setRenaming(false)
    if (!commit) return
    const next = draftName.trim()
    if (next === originName.trim()) return
    void onRenameOrigin?.(next).then((ok) => {
      if (!ok) showToast(t('renameFailed'))
    })
  }

  return (
    <>
      {/* 卡头卡：标题 + 说明（说明替代字段标签），按内容高度。 */}
      <section className="timeline-card timeline-origin-head" aria-label={displayName}>
        <div className="timeline-card__head">
          <div className="timeline-card__title-row">
            {renaming ? (
              <input
                className="timeline-rename timeline-origin-rename"
                type="text"
                value={draftName}
                autoFocus
                spellCheck={false}
                aria-label={t('originRename')}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => settleRename(true)}
                onKeyDown={(event) => {
                  // 中文输入法选词回车不提交（isComposing 期间 Enter 属于组字确认）。
                  if (event.nativeEvent.isComposing) return
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    settleRename(true)
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    settleRename(false)
                  }
                }}
              />
            ) : (
              <span className="timeline-card__title">{displayName}</span>
            )}
            {renaming ? null : (
              <IconButton
                size="sm"
                className="row-act timeline-origin-rename-btn"
                label={t('originRename')}
                tooltipPlacement="top"
                onClick={beginRename}
              >
                <PencilIcon />
              </IconButton>
            )}
          </div>
          <p className="timeline-card__desc">{t('originDesc')}</p>
        </div>
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
