import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider } from 'react-i18next'
import { initI18n } from '../i18n'
import { applyTheme, readStoredTheme } from './theme'
import { StyleguideApp } from './StyleguideApp'
import '../styles/index.css'
import './styleguide.css'
import './styleguide-showcase.css'

/**
 * 展示页启动：
 * 1. 先落主题（避免首帧亮色闪烁），再 await 语言包——`Tag` / `Window` / `Select` /
 *    `Combobox` / `Splitter` 内部无条件调用 `useTranslation`，必须等 i18next 就绪；
 * 2. 固定 en：展示页自身文案为中文（dev 工具豁免 §10），组件内建文案用英文，
 *    同时验证英文资源包不会缺 key。
 */
async function bootstrap(): Promise<void> {
  applyTheme(readStoredTheme())

  const i18n = await initI18n('en')

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <StyleguideApp />
      </I18nextProvider>
    </StrictMode>
  )
}

void bootstrap()
