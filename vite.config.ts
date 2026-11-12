import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, type Plugin } from 'vite'

import { thirdPartyNotices } from './scripts/third-party-notices.mjs'

const CSS_FILE = 'clearideas-widget.css'
// `npm run dev` (scripts/dev.mjs) sets this: build only the browser bundle the pages load, without
// minification, so each rebuild takes seconds. `npm run build` builds every format, minified.
const DEV_BUILD = process.env.CLEARIDEAS_DEV_BUILD === '1'
const { version: PACKAGE_VERSION } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

/**
 * Makes each JavaScript bundle self-contained: appends a line that registers the compiled widget
 * CSS under a global symbol (keyed by package version). The widget applies it to its shadow root
 * when it mounts (src/utils/styles.ts); nothing is added to the page when the bundle loads. The
 * CSS file is still emitted for the .vue component and pages that link it.
 *
 * The line is appended (not prepended) so source maps stay valid.
 */
function registerCssInBundles(): Plugin {
  return {
    name: 'register-css-in-bundles',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const cssAsset = bundle[CSS_FILE]
      if (!cssAsset || cssAsset.type !== 'asset') return
      const css = String(cssAsset.source)
      const registration =
        `;(function(){var k=Symbol.for('clearideas.chat.css'),g=globalThis;` +
        `(g[k]=g[k]||{})[${JSON.stringify(PACKAGE_VERSION)}]=${JSON.stringify(css)}})();\n`
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk' || !output.isEntry) continue
        const mapComment = output.code.lastIndexOf('\n//# sourceMappingURL=')
        output.code =
          mapComment >= 0
            ? output.code.slice(0, mapComment + 1) +
              registration +
              output.code.slice(mapComment + 1)
            : output.code + '\n' + registration
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Default API base URL - can be overridden at build time or via props
    // This will be replaced at build time with the actual value
    __WIDGET_VERSION__: JSON.stringify(PACKAGE_VERSION),
    __VITE_API_BASE_URL__: JSON.stringify(
      process.env.VITE_API_BASE_URL || 'https://api.clearideas.com',
    ),
    // Replace process.env.NODE_ENV for dependencies (e.g., markdown-it)
    // This ensures browser compatibility for code that checks process.env.NODE_ENV
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    // Use Vue runtime-only build (smaller, templates are pre-compiled)
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'ClearIdeasWidget',
      fileName: format =>
        format === 'cjs' ? 'clearideas-widget.cjs' : `clearideas-widget.${format}.js`,
      formats:
        DEV_BUILD && process.env.CLEARIDEAS_PACKAGE_DEV !== '1' ? ['iife'] : ['es', 'cjs', 'iife'],
    },
    rolldownOptions: {
      // No external dependencies - bundle everything including Vue
      output: {
        exports: 'named',
        codeSplitting: false,
        assetFileNames: assetInfo => {
          // Rename CSS files to clearideas-widget.css
          if (assetInfo.names.some(name => name.endsWith('.css'))) {
            return CSS_FILE
          }
          return assetInfo.names[0] || 'asset'
        },
      },
    },
    cssCodeSplit: false,
    // Enable sourcemaps for production debugging (hidden sourcemaps to reduce size)
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    minify: DEV_BUILD ? false : 'terser',
    terserOptions: {
      compress: {
        // Keep console.warn/error (problems integrators need to see) and console.info (debug
        // logging, off unless window.__ClearIdeasWidgetDebug is set).
        drop_console: false,
        drop_debugger: true,
        // Safe optimizations only
        passes: 2, // Reduced from 3 for faster builds
        unused: true, // Remove unused code
        dead_code: true,
        collapse_vars: true,
        reduce_vars: true,
        inline: 1, // Conservative inlining (reduced from 2)
        reduce_funcs: true,
        // Removed unsafe options:
        // - unsafe: true
        // - unsafe_comps: true
        // - unsafe_math: true
        // - unsafe_methods: true
        // - unsafe_proto: true
        // - unsafe_regexp: true
        // - unsafe_undefined: true
      },
      format: {
        comments: false, // Remove comments
        beautify: false,
        ecma: 2020,
      },
      mangle: {
        safari10: true,
        properties: false, // Keep property names (needed for Vue)
      },
    },
    target: 'es2020',
    outDir: 'dist',
  },
  plugins: [
    registerCssInBundles(),
    {
      name: 'third-party-notices',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'THIRD_PARTY_NOTICES.txt',
          source: thirdPartyNotices(this.getModuleIds()),
        })
      },
    },
    vue({
      script: { defineModel: true },
      template: {
        compilerOptions: {
          // Optimize template compilation
          hoistStatic: true,
          cacheHandlers: true,
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      // Use Vue runtime browser build (pre-compiled for browsers, no process.env.NODE_ENV checks)
      vue: 'vue/dist/vue.runtime.esm-browser.prod.js',
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
      },
    },
  },
})
