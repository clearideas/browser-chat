// Main entry point for the package
export { default as ClearIdeasWidgetStandalone } from './ClearIdeasWidgetStandalone.vue'
export { init } from './entry'
export { BUILT_IN_LOCALES } from './i18n/locales'
export type { WidgetMessageOverrides, WidgetMessages, WidgetMessagesOption } from './i18n/types'
export { themeCSS } from './theme'
export type {
  ChatMessage,
  InitResponse,
  StreamEvent,
  WidgetAction,
  WidgetConfig,
  WidgetInstance,
  WidgetProps,
} from './types'
