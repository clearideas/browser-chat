import eslintPlugin from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser' // Import vue-eslint-parser

export default [
  // Ignore build output directories
  {
    ignores: ['dist/**', 'node_modules/**'],
  },

  // Configuration for .vue files
  {
    files: ['**/*.vue'], // Lint .vue files
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: vueParser, // Use vue-eslint-parser for Vue files
      parserOptions: {
        parser: typescriptParser, // Use @typescript-eslint/parser inside <script lang="ts">
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': eslintPlugin,
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSort,
      vue: vuePlugin, // Vue plugin included here
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': [
        'warn', // Changed from 'error' to 'warn' to be less aggressive
        {
          singleQuote: true,
          semi: false,
          trailingComma: 'all',
          arrowParens: 'avoid',
          printWidth: 100,
          endOfLine: 'auto',
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'vue/no-unused-vars': 'error', // Ensure variables in <script setup> are used correctly
      // Vue-specific rules
      'vue/no-multiple-template-root': 'off',
      'vue/no-v-model-argument': 'off',
      'vue/no-template-shadow': 'error',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'off',
      'vue/require-prop-types': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
    },
    settings: {
      ...prettierConfig,
    },
  },

  // Configuration for .js and .ts files
  {
    files: ['**/*.{js,ts}'], // Lint .js and .ts files
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: typescriptParser, // Use @typescript-eslint/parser for .js and .ts files
    },
    plugins: {
      '@typescript-eslint': eslintPlugin,
      prettier: prettierPlugin,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': [
        'warn', // Changed from 'error' to 'warn' to be less aggressive
        {
          singleQuote: true,
          semi: false,
          trailingComma: 'all',
          arrowParens: 'avoid',
          printWidth: 100,
          endOfLine: 'auto',
        },
      ],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
    settings: {
      ...prettierConfig,
    },
  },
]
