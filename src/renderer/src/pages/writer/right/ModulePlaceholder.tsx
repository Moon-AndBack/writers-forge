import type { ReactElement } from 'react'
import type { WriterModule } from '../../../shell/activityBar'
import { useModuleLabel } from '../../../shell/activityBar'
import PlaceholderView from '../PlaceholderView'

/** 占位模块面板：显示名走 `module` i18n 命名空间（键即模块 id），随界面语言切换。 */
export function ModulePlaceholder({ id }: { id: WriterModule }): ReactElement {
  const label = useModuleLabel(id)
  return <PlaceholderView label={label} compact />
}

export default ModulePlaceholder
