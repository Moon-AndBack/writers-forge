import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Alias } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * react-router 7 的 package exports 只指向 `dist/development/*`（无 production 条件），
 * 默认打进产物的就是带 dev-only 警告的 development 构建。production 构建里
 * `ENABLE_DEV_WARNINGS = false`，minify 后部分 dev-only 警告分支被 DCE 消除，入口体积略降。
 *
 * 仅 build 阶段替换：`react-router-dom` 自身只是 `export * from 'react-router'` +
 * 转发 `react-router/dom`，故别名只需落在 `react-router` 与 `react-router/dom` 两个入口；
 * dev（serve）阶段保留 development 构建，以便仍然看到路由警告。
 */
function reactRouterProdAlias(command: 'build' | 'serve'): Alias[] {
  if (command !== 'build') return []
  return [
    {
      find: /^react-router$/,
      replacement: resolve('node_modules/react-router/dist/production/index.mjs')
    },
    {
      find: /^react-router\/dom$/,
      replacement: resolve('node_modules/react-router/dist/production/dom-export.mjs')
    }
  ]
}

export default defineConfig(({ command }) => ({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: [
        { find: '@renderer', replacement: resolve('src/renderer/src') },
        ...reactRouterProdAlias(command)
      ]
    },
    plugins: [react()],
    build: {
      minify: 'esbuild',
      reportCompressedSize: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          /**
           * 语言包动态 chunk 按语言命名：locales/{zh-CN,en}/index.ts 的 basename 均为 `index`，
           * 默认会产出多个同名 `index-*.js`（与入口 chunk 难以区分）；此处在命中语言目录时
           * 改写为 `zh-CN-*.js` / `en-*.js`，其余 chunk 保持默认命名。
           */
          chunkFileNames: (chunkInfo) => {
            const locale = chunkInfo.facadeModuleId?.match(
              /[\\/]locales[\\/](zh-CN|en)[\\/]index\.ts$/
            )
            return locale ? `assets/${locale[1]}-[hash].js` : 'assets/[name]-[hash].js'
          }
        }
      }
    }
  }
}))
