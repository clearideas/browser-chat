import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()] as any,
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
    projects: [
      {
        // Component and client tests with mocked HTTP (MSW).
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./tests/setup.ts'],
          include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
          exclude: [
            'tests/e2e/**',
            'tests/conformance/**',
            'tests/server/**',
            'tests/live/**',
            'test-results/**',
            'playwright-report/**',
          ],
        },
      },
      {
        // The test server (tests/server) and protocol conformance over real HTTP
        // (tests/conformance). Conformance runs against the in-process test server, or against any
        // server given CHAT_SERVER_URL (see tests/conformance/helpers/target.ts).
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['tests/conformance/**/*.test.ts', 'tests/server/**/*.test.ts'],
        },
      },
      {
        // The real widget component against the real test server over HTTP (no MSW).
        extends: true,
        test: {
          name: 'live',
          environment: 'jsdom',
          setupFiles: ['./tests/live/setup.ts'],
          include: ['tests/live/**/*.test.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  define: {
    __VITE_API_BASE_URL__: JSON.stringify('https://api.clearideas.local'),
    __WIDGET_VERSION__: JSON.stringify('test'),
    'process.env.NODE_ENV': JSON.stringify('test'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
})
