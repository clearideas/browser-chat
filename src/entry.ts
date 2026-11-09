import { createApp } from 'vue'

import ClearIdeasWidgetStandalone from './ClearIdeasWidgetStandalone.vue'
import { themeCSS } from './theme'
import type { WidgetAction, WidgetConfig, WidgetInstance } from './types'
import { autoInitializeFromDataAttributes } from './utils/auto-init'
import { injectThemeCSS } from './utils/css'

// Singleton widget instance (only one widget per page)
let widgetInstance: WidgetInstance | null = null
let appInstance: ReturnType<typeof createApp> | null = null
let containerElement: HTMLElement | null = null

// Inject theme CSS into document head (side-effect on module load)
// This ensures the theme is available before any widget initialization.
// The injection is idempotent - subsequent calls are no-ops if already injected.
injectThemeCSS(themeCSS)

/**
 * Checks if consent has been given based on the hasConsent config
 */
function checkConsent(hasConsent?: boolean | (() => boolean) | string): boolean {
  if (hasConsent === undefined || hasConsent === true) {
    return true
  }
  if (hasConsent === false) {
    return false
  }
  if (typeof hasConsent === 'function') {
    return hasConsent()
  }
  if (typeof hasConsent === 'string') {
    // Check global variable or function
    if (typeof window !== 'undefined') {
      const globalValue = (window as any)[hasConsent]
      if (typeof globalValue === 'function') {
        return globalValue()
      }
      return Boolean(globalValue)
    }
  }
  return true
}

/**
 * Creates a no-op widget instance that does nothing until consent is granted
 */
function createNoOpInstance(): WidgetInstance {
  return {
    open: () => {
      console.warn(
        '[ClearIdeasWidget] Widget is pending consent. Call init() again after consent is granted.',
      )
    },
    close: () => {},
    toggle: () => {
      console.warn(
        '[ClearIdeasWidget] Widget is pending consent. Call init() again after consent is granted.',
      )
    },
    sendMessage: async (_content: string) => {
      console.warn(
        '[ClearIdeasWidget] Widget is pending consent. Call init() again after consent is granted.',
      )
    },
    hide: () => {},
    show: () => {},
    openChatDirectly: () => {
      console.warn(
        '[ClearIdeasWidget] Widget is pending consent. Call init() again after consent is granted.',
      )
    },
    setDarkMode: (_isDark: boolean) => {},
    setConsentRequired: (_required: boolean) => {},
    setConsentGranted: (_granted: boolean) => {},
    setPosition: (_position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') => {},
    setWidth: (_width: number) => {},
    setHeight: (_height: number) => {},
    setTop: (_top: number | undefined) => {},
    setRight: (_right: number | undefined) => {},
    setBottom: (_bottom: number | undefined) => {},
    setLeft: (_left: number | undefined) => {},
    setFabSize: (_size: number) => {},
    setActions: (_actions: WidgetAction[]) => {},
    setUserName: (_name: string | undefined) => {},
    setUserEmail: (_email: string | undefined) => {},
    setUserId: (_id: string | undefined) => {},
    setLocale: (_locale: string | undefined) => {},
    destroy: () => {},
  }
}

/**
 * Initialize a Clear Ideas widget instance
 * @param config - Widget configuration
 * @returns Widget instance with control methods
 * @throws {Error} If throwOnMissingConsent is true and consent is not granted
 */
export function init(config: WidgetConfig): WidgetInstance {
  // Always log init() calls with stack trace to identify where it's being called from
  console.log('[ClearIdeasWidget] init() called', {
    hasAccessKey: !!config.accessKey,
    hasApiBaseUrl: !!config.apiBaseUrl,
    consentRequired: config.consentRequired,
    consentGranted: config.consentGranted,
    stackTrace: new Error().stack?.split('\n').slice(2, 6).join('\n'),
  })

  // Check consent before initializing
  if (!checkConsent(config.hasConsent)) {
    if (config.throwOnMissingConsent) {
      throw new Error(
        'Widget initialization requires consent. Set hasConsent to true or ensure the consent check passes before calling init().',
      )
    }
    // Return a no-op instance if consent is not granted (unless throwOnMissingConsent is true)
    console.warn('[ClearIdeasWidget] init() returning no-op instance due to missing consent')
    return createNoOpInstance()
  }

  // Validate required props
  if (!config.accessKey) {
    console.error('[ClearIdeasWidget] init() called without accessKey - widget will not initialize')
  }
  if (!config.apiBaseUrl && typeof __VITE_API_BASE_URL__ === 'undefined') {
    console.error(
      '[ClearIdeasWidget] init() called without apiBaseUrl and no build-time default - widget will not initialize',
    )
  }

  // Destroy existing instance if any
  if (widgetInstance) {
    console.log('[ClearIdeasWidget] Destroying existing widget instance before creating new one')
    widgetInstance.destroy()
  }

  const resolvedConfig: WidgetConfig = {
    ...config,
  }

  // Find or create container element
  let container: HTMLElement
  if (typeof config.container === 'string') {
    const element = document.querySelector(config.container)
    if (!element) {
      throw new Error(`Container element "${config.container}" not found`)
    }
    container = element as HTMLElement
  } else if (config.container instanceof HTMLElement) {
    container = config.container
  } else {
    // Create default container
    container = document.createElement('div')
    container.id = 'clearideas-widget-container'
    document.body.appendChild(container)
  }

  containerElement = container

  // Create Vue app
  const app = createApp(ClearIdeasWidgetStandalone, resolvedConfig as any)
  const vm = app.mount(container)

  appInstance = app

  // Create widget instance API
  const componentInstance = vm as any

  widgetInstance = {
    open: () => {
      if (componentInstance?.openWidget) {
        componentInstance.openWidget()
      }
    },
    close: () => {
      if (componentInstance?.closeWidget) {
        componentInstance.closeWidget()
      }
    },
    toggle: () => {
      if (componentInstance?.toggleWidget) {
        componentInstance.toggleWidget()
      }
    },
    sendMessage: async (content: string) => {
      if (componentInstance?.sendPublicChatMessage) {
        await componentInstance.sendPublicChatMessage(content)
      }
    },
    hide: () => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] hide() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.hideFab === 'function') {
        componentInstance.hideFab()
      } else {
        console.warn('[ClearIdeasWidget] hideFab method not found on component instance')
      }
    },
    show: () => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] show() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.showFab === 'function') {
        componentInstance.showFab()
      } else {
        console.warn('[ClearIdeasWidget] showFab method not found on component instance')
      }
    },
    openChatDirectly: () => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] openChatDirectly() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.openChatDirectly === 'function') {
        componentInstance.openChatDirectly()
      } else {
        console.warn('[ClearIdeasWidget] openChatDirectly method not found on component instance')
      }
    },
    setDarkMode: (isDark: boolean) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setDarkMode() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setDarkMode === 'function') {
        componentInstance.setDarkMode(isDark)
      } else {
        console.warn('[ClearIdeasWidget] setDarkMode method not found on component instance')
      }
    },
    setConsentRequired: (required: boolean) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setConsentRequired() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setConsentRequired === 'function') {
        componentInstance.setConsentRequired(required)
      }
    },
    setConsentGranted: (granted: boolean) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setConsentGranted() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setConsentGranted === 'function') {
        componentInstance.setConsentGranted(granted)
      }
    },
    setPosition: (position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left') => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setPosition() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setPosition === 'function') {
        componentInstance.setPosition(position)
      }
    },
    setWidth: (width: number) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setWidth() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setWidth === 'function') {
        componentInstance.setWidth(width)
      }
    },
    setHeight: (height: number) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setHeight() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setHeight === 'function') {
        componentInstance.setHeight(height)
      }
    },
    setTop: (top: number | undefined) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setTop() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setTop === 'function') {
        componentInstance.setTop(top)
      }
    },
    setRight: (right: number | undefined) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setRight() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setRight === 'function') {
        componentInstance.setRight(right)
      }
    },
    setBottom: (bottom: number | undefined) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setBottom() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setBottom === 'function') {
        componentInstance.setBottom(bottom)
      }
    },
    setLeft: (left: number | undefined) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setLeft() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setLeft === 'function') {
        componentInstance.setLeft(left)
      }
    },
    setFabSize: (size: number) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setFabSize() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setFabSize === 'function') {
        componentInstance.setFabSize(size)
      }
    },
    setActions: (actions: any[]) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setActions() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setActions === 'function') {
        componentInstance.setActions(actions)
      }
    },
    setUserName: (name: string | undefined) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setUserName() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setUserName === 'function') {
        componentInstance.setUserName(name)
      }
    },
    setUserEmail: (email: string | undefined) => {
      if (!componentInstance) {
        console.warn(
          '[ClearIdeasWidget] setUserEmail() called but widget instance is not initialized',
        )
        return
      }
      if (typeof componentInstance.setUserEmail === 'function') {
        componentInstance.setUserEmail(email)
      }
    },
    setUserId: (id: string | undefined) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setUserId() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setUserId === 'function') {
        componentInstance.setUserId(id)
      }
    },
    setLocale: (locale: string | undefined) => {
      if (!componentInstance) {
        console.warn('[ClearIdeasWidget] setLocale() called but widget instance is not initialized')
        return
      }
      if (typeof componentInstance.setLocale === 'function') {
        componentInstance.setLocale(locale)
      }
    },
    destroy: () => {
      // Unmount Vue app
      if (appInstance) {
        appInstance.unmount()
        appInstance = null
      }

      // Remove container if it was auto-created
      if (
        containerElement &&
        containerElement.parentNode &&
        containerElement.id === 'clearideas-widget-container'
      ) {
        containerElement.parentNode.removeChild(containerElement)
      }

      widgetInstance = null
      containerElement = null
    },
  }

  if (resolvedConfig.locale) {
    widgetInstance.setLocale(resolvedConfig.locale)
  }

  return widgetInstance
}

// Auto-initialize from data attributes
if (typeof document !== 'undefined') {
  autoInitializeFromDataAttributes(init)
}

// Expose global API
if (typeof window !== 'undefined') {
  ;(window as any).ClearIdeasWidget = {
    init,
  }
}
