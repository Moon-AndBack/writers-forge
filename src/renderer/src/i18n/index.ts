/**
 * i18next 单例初始化（渲染层）。
 *
 * 设计要点：
 * - 语言包分两层按需加载：
 *   1. **core ns**（入口语言包）：App / 书店 / 欢迎页 / 外壳 / 设置弹窗首屏即用，
 *      启动时仅动态 `import()` 当前语言的 core 包（见 `CORE_LOADERS`）；另一语言在
 *      切换时才加载并 `addResourceBundle`；
 *   2. **写作域 ns**（`writerResources`）：仅写作页使用，由 `ensureWriterNamespaces`
 *      在 `App.tsx` 的 `Writer` lazy loader 中先于页面 chunk 加载（见 `WRITER_LOADERS`），
 *      书架 / 欢迎页首屏不触碰；两包各自成 chunk，避免入口被写作域文案撑大。
 * - 单例在模块级只初始化一次（`initialized` 守卫），后续 `changeLocale` 复用同一实例；
 * - `lng` 由启动阶段（main.tsx 读 settings 后经 `resolveLocale`）传入；`initI18n`
 *   为 async，main.tsx 在 `render()` 之前 `await`，首帧即目标语言，不闪文案；
 *   `fallbackLng` 恒为 zh-CN（key 由类型全等保证，缺失时才回退）；
 * - `useSuspense: false`：初始化前资源已就位，运行期切换由 `changeLocale` 先加载再切语言；
 * - 不引入 `i18next-browser-languagedetector`：语言真源 = settings.locale + navigator.language，
 *   统一由 `resolveLocale` 规整（见 ./config）。
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LOCALE, type Locale } from './config'

/**
 * core 语言包结构：以 zh-CN 聚合结构为真源（`t()` 的静态类型不依赖运行时加载）。
 * en 由各 ns 文件与聚合处的 `satisfies` 保证 key 全等。
 */
export type LocalePackage = typeof import('./locales/zh-CN').default

/** 写作域语言包结构（取自 `./locales/<locale>/writerResources`）。 */
export type WriterPackage = typeof import('./locales/zh-CN/writerResources').default

/**
 * 语言 → core 语言包动态加载器。
 *
 * 显式映射（而非拼接模板路径）便于构建工具静态分析，为每种语言各产出一个独立 chunk。
 */
const CORE_LOADERS: Record<Locale, () => Promise<{ default: LocalePackage }>> = {
  'zh-CN': () => import('./locales/zh-CN'),
  en: () => import('./locales/en')
}

/**
 * 语言 → 写作域语言包动态加载器：与 core **分开的模块**，故单独成 chunk，
 * 只有进入写作页（或写作页内切换语言）时才会被请求。
 *
 * 注意 `dossier` 归入本包的前提是「活动栏只在写作页渲染」：使用 `dossier` 的
 * `ActivityBarFilterPopover` 挂在活动栏内，而活动栏是否渲染由 `useActivityBar().visible`
 * 决定——只有 `pages/Writer.tsx` 通过 `useRegisterActivityBar(true)` 注册，书架 / 欢迎页
 * 不注册。若将来活动栏出现在书架等非写作页，必须把 `dossier` 迁回 core 包（或在该页
 * 单独 `ensureWriterNamespaces`），否则会出现缺 key。
 */
const WRITER_LOADERS: Record<Locale, () => Promise<{ default: WriterPackage }>> = {
  'zh-CN': () => import('./locales/zh-CN/writerResources'),
  en: () => import('./locales/en/writerResources')
}

/** 已注入 i18next 的 core 语言档位（避免重复加载同一份资源）。 */
const loadedCoreLocales = new Set<Locale>()

/** 已注入 i18next 的写作域语言档位。 */
const loadedWriterLocales = new Set<Locale>()

/**
 * 是否进入过写作域（任一语言的 writer ns 被请求过）。
 * 一旦为 true，后续语言切换必须为目标语言补齐 writer ns，否则写作页会缺 key。
 */
let writerRequested = false

let initialized = false

/** 动态加载 core 语言包并注入 i18next（幂等）；已注入则直接返回。 */
async function ensureResources(locale: Locale): Promise<void> {
  if (loadedCoreLocales.has(locale)) return
  const { default: bundle } = await CORE_LOADERS[locale]()
  for (const [ns, resources] of Object.entries(bundle)) {
    if (!i18n.hasResourceBundle(locale, ns)) {
      i18n.addResourceBundle(locale, ns, resources, true, true)
    }
  }
  loadedCoreLocales.add(locale)
}

/**
 * 按需加载**写作域**语言包（幂等）：`App.tsx` 的 `Writer` lazy loader 必须在本函数
 * resolve 之后再 `import('./pages/Writer')`，保证写作页挂载时 ns 已注册、不闪 key。
 *
 * 调用即视为「已进入写作域」（`writerRequested`），此后 `changeLocale` 会同步补齐
 * 目标语言的写作域资源。locale 传 `resolveLocale(i18n.language)`，避免与切换竞态。
 */
export async function ensureWriterNamespaces(locale: Locale): Promise<void> {
  writerRequested = true
  if (loadedWriterLocales.has(locale)) return
  const { default: bundle } = await WRITER_LOADERS[locale]()
  for (const [ns, resources] of Object.entries(bundle)) {
    if (!i18n.hasResourceBundle(locale, ns)) {
      i18n.addResourceBundle(locale, ns, resources, true, true)
    }
  }
  loadedWriterLocales.add(locale)
}

/**
 * 初始化 i18next（幂等）：仅首次调用创建实例并注入 core 语言包，之后等价于切换语言。
 * main.tsx 必须 `await` 本函数后再 `render()`，否则首帧可能取不到文案。
 * 首帧只加载 core 包，写作域包留到进入写作页时（`ensureWriterNamespaces`）。
 */
export async function initI18n(locale: Locale): Promise<typeof i18n> {
  if (initialized) {
    await changeLocale(locale)
    return i18n
  }
  const { default: bundle } = await CORE_LOADERS[locale]()
  await i18n.use(initReactI18next).init({
    resources: { [locale]: bundle },
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false }
  })
  loadedCoreLocales.add(locale)
  initialized = true
  return i18n
}

/**
 * 切换界面语言：先确保目标语言 core 包已加载（必要时 `import()` 并 `addResourceBundle`），
 * 若曾进入写作域，再把目标语言的写作域包也补齐，最后 `changeLanguage`——
 * 资源就位后切换，`useTranslation` 订阅者随之重渲染，当前页面所有 ns 均可用。
 */
export async function changeLocale(next: Locale): Promise<void> {
  await ensureResources(next)
  if (writerRequested) await ensureWriterNamespaces(next)
  if (i18n.language !== next) await i18n.changeLanguage(next)
}

export { i18n }
export default i18n
