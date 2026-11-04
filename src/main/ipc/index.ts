import type { DiagnosticsReport } from '../database/diagnostics'
import { registerAiIpc } from './ai'
import { registerBooksIpc } from './books'
import { registerCategoriesIpc } from './categories'
import { registerChapterSearchIpc } from './chapterSearch'
import { registerChaptersIpc } from './chapters'
import { registerChipColorsIpc } from './chipColors'
import { registerCleanWordsIpc } from './cleanWords'
import { registerDiagnosticsIpc } from './diagnostics'
import { registerEntitiesIpc } from './entities'
import { registerForeshadowsIpc } from './foreshadows'
import { registerImagesIpc } from './images'
import { registerOneDriveIpc } from './onedrive'
import { registerOutlineIpc } from './outline'
import { registerPlotIpc } from './plot'
import { registerSettingsIpc } from './settings'
import { registerSnapIpc } from './snap'
import { registerStatsIpc } from './stats'
import { registerThemeIpc } from './theme'
import { registerWindowIpc } from './window'
import { registerWorldEntitiesIpc } from './worldEntities'
import { registerWorldSubtypesIpc } from './worldSubtypes'

/**
 * 注册全部 IPC 通道。
 *
 * `diagnosticsReport` 为启动时一次性自检结果（见 `src/main/index.ts`），
 * 仅由 `diagnostics:get` 只读回传。
 */
export function registerIpc(diagnosticsReport: DiagnosticsReport): void {
  registerAiIpc()
  registerBooksIpc()
  registerCategoriesIpc()
  registerChaptersIpc()
  registerChapterSearchIpc()
  registerChipColorsIpc()
  registerCleanWordsIpc()
  registerDiagnosticsIpc(diagnosticsReport)
  registerEntitiesIpc()
  registerForeshadowsIpc()
  registerImagesIpc()
  registerOneDriveIpc()
  registerOutlineIpc()
  registerPlotIpc()
  registerSettingsIpc()
  registerSnapIpc()
  registerStatsIpc()
  registerThemeIpc()
  registerWindowIpc()
  registerWorldEntitiesIpc()
  registerWorldSubtypesIpc()
}
