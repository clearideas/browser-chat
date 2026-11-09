import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vite'

import { thirdPartyNotices } from './scripts/third-party-notices.mjs'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 8000,
    fs: {
      strict: false,
    },
  },
  define: {
    // Default API base URL - can be overridden at build time or via props
    // This will be replaced at build time with the actual value
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
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ClearIdeasWidget',
      fileName: format =>
        format === 'cjs' ? 'clearideas-widget.cjs' : `clearideas-widget.${format}.js`,
      formats: ['es', 'cjs', 'iife'],
    },
    rolldownOptions: {
      // No external dependencies - bundle everything including Vue
      output: {
        exports: 'named',
        codeSplitting: false,
        assetFileNames: assetInfo => {
          // Rename CSS files to clearideas-widget.css
          if (assetInfo.names.some(name => name.endsWith('.css'))) {
            return 'clearideas-widget.css'
          }
          return assetInfo.names[0] || 'asset'
        },
      },
    },
    cssCodeSplit: false,
    // Enable sourcemaps for production debugging (hidden sourcemaps to reduce size)
    sourcemap: process.env.NODE_ENV === 'production' ? 'hidden' : true,
    minify: 'terser',
    terserOptions: {
      compress: {
        // Keep console statements for debugging - they're needed for troubleshooting
        drop_console: true,
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
      '@': resolve(__dirname, 'src'),
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
