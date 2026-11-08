/**
 * 回收站中栏「列表卡 + 分隔条 + 详情卡」两栏外壳（章节 / 大纲 / 伏笔 / 灵感共用）。
 *
 * 宽度 state 收敛在本组件：拖拽逐帧只重渲染本组件，`list` / `detail` 由调用方以
 * element 形式传入，引用稳定时 React 直接跳过两栏子树的 reconcile（同
 * `pages/writer/WorkspaceLayout.tsx` 的窄化重渲染策略）。
 *
 * 宽度经 `--trash-list-width` 下发到 `.trash-list-card`，`.trash-body` 的
 * `max-width` 兜底负责窄中栏时给详情卡让位；持久化见 `shell/useTrashListWidth`。
 */
import { useRef } from 'react'
import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { useTrashListWidth } from '../../shell/useTrashListWidth'
import { TRASH_LIST_DEFAULT, TRASH_LIST_MAX, TRASH_LIST_MIN } from '../../shell/trashListWidth'
import { Splitter } from '../ui/Splitter'

export interface TrashSplitLayoutProps {
  /** 列表卡内容（调用方传入的 head + 列表，引用稳定性决定拖拽时是否跳过 reconcile）。 */
  list: ReactNode
  /** 详情卡内容（选中详情或详情空态）。 */
  detail: ReactNode
}

export function TrashSplitLayout({ list, detail }: TrashSplitLayoutProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null)
  const { width, setWidth } = useTrashListWidth()

  const style = {
    '--trash-list-width': `${width}px`
  } as CSSProperties

  return (
    <div className="trash-body" style={style}>
      <div className="trash-list-card" ref={listRef}>
        {list}
      </div>

      <Splitter
        side="left"
        targetRef={listRef}
        min={TRASH_LIST_MIN}
        max={TRASH_LIST_MAX}
        value={width}
        defaultValue={TRASH_LIST_DEFAULT}
        onChange={setWidth}
      />

      <aside className="trash-detail">{detail}</aside>
    </div>
  )
}

export default TrashSplitLayout
