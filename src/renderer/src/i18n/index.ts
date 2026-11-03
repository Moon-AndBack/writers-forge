/**
 * i18next 单例初始化（渲染层）。
 *
 * 设计要点：
 * - 语言包按需加载：入口只保留加载器，启动时仅动态 `import()` 当前语言（见
 *   `LOCALE_LOADERS`）；另一语言在切换时才加载并 `addResourceBundle`，避免两份
 *   资源（约 113 kB）全部进入启动模块图；
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
 * 单个语言包结构：以 zh-CN 聚合结构为真源（`t()` 的静态类型不依赖运行时加载）。
 * en 由各 ns 文件与聚合处的 `satisfies ZhCNResources` 保证 key 全等。
 */
export type LocalePackage = typeof import('./locales/zh-CN').default

/**
 * 语言 → 语言包动态加载器。
 *
 * 显式映射（而非拼接模板路径）便于构建工具静态分析，为每种语言各产出一个独立 chunk。
 */
const LOCALE_LOADERS: Record<Locale, () => Promise<{ default: LocalePackage }>> = {
  'zh-CN': () => import('./locales/zh-CN'),
  en: () => import('./locales/en')
}

/** 已注入 i18next 的语言档位（避免重复加载同一份资源）。 */
const loadedLocales = new Set<Locale>()

let initialized = false

/** 动态加载语言包并注入 i18next（幂等）；已注入则直接返回。 */
async function ensureResources(locale: Locale): Promise<void> {
  if (loadedLocales.has(locale)) return
  const { default: bundle } = await LOCALE_LOADERS[locale]()
  for (const [ns, resources] of Object.entries(bundle)) {
    if (!i18n.hasResourceBundle(locale, ns)) {
      i18n.addResourceBundle(locale, ns, resources, true, true)
    }
  }
  loadedLocales.add(locale)
}

/**
 * 初始化 i18next（幂等）：仅首次调用创建实例并注入语言包，之后等价于切换语言。
 * main.tsx 必须 `await` 本函数后再 `render()`，否则首帧可能取不到文案。
 */
export async function initI18n(locale: Locale): Promise<typeof i18n> {
  if (initialized) {
    await changeLocale(locale)
    return i18n
  }
  const { default: bundle } = await LOCALE_LOADERS[locale]()
  await i18n.use(initReactI18next).init({
    resources: { [locale]: bundle },
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: false }
  })
  loadedLocales.add(locale)
  initialized = true
  return i18n
}

/**
 * 切换界面语言：先确保目标语言包已加载（必要时 `import()` 并 `addResourceBundle`），
 * 再 `changeLanguage`——资源就位后切换，`useTranslation` 订阅者随之重渲染。
 */
export async function changeLocale(next: Locale): Promise<void> {
  await ensureResources(next)
  if (i18n.language !== next) await i18n.changeLanguage(next)
}

export { i18n }
export default i18n
