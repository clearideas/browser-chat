import { createApp } from 'vue'

import ClearIdeasWidgetStandalone from './ClearIdeasWidgetStandalone.vue'
import { BUILT_IN_LOCALES } from './i18n/locales'
import type { WidgetConfig, WidgetInstance } from './types'
import { autoInitializeFromDataAttributes } from './utils/auto-init'
import { applyStyles, getBundledCss, HOST_CSS } from './utils/styles'

const DEFAULT_CONTAINER_ID = 'clearideas-widget-container'

/**
 * Live widgets by container. Each init() creates an independent widget that owns its Vue app,
 * shadow host and listeners. Calling init() again for the same container (or again without a
 * container) replaces that widget, so re-initializing after login or consent keeps working;
 * widgets in different containers coexist.
 */
const widgetsByContainer = new Map<HTMLElement | 'default', WidgetInstance>()

/** WidgetInstance methods and the component methods they call. */
const COMPONENT_METHODS = {
  open: 'openWidget',
  close: 'closeWidget',
  toggle: 'toggleWidget',
  sendMessage: 'sendPublicChatMessage',
  stopReply: 'stopReply',
  hide: 'hideFab',
  show: 'showFab',
  openChatDirectly: 'openChatDirectly',
  setDarkMode: 'setDarkMode',
  setConsentRequired: 'setConsentRequired',
  setConsentGranted: 'setConsentGranted',
  setPosition: 'setPosition',
  setWidth: 'setWidth',
  setHeight: 'setHeight',
  setTop: 'setTop',
  setRight: 'setRight',
  setBottom: 'setBottom',
  setLeft: 'setLeft',
  setFabSize: 'setFabSize',
  setActions: 'setActions',
  setUserName: 'setUserName',
  setUserEmail: 'setUserEmail',
  setUserId: 'setUserId',
  setLocale: 'setLocale',
  setMessages: 'setMessages',
} as const satisfies Record<Exclude<keyof WidgetInstance, 'destroy'>, string>

type MethodName = keyof typeof COMPONENT_METHODS

/**
 * Creates the element the widget renders into. By default the widget lives in an open shadow
 * root, so page styles cannot change it and its styles cannot leak into the page.
 */
function createMountPoint(
  container: HTMLElement,
  useShadowDom: boolean,
): { host: HTMLElement; mountPoint: HTMLElement } {
  // Custom element names and no box of their own: page rules for div or other tags do not apply,
  // and page CSS that styles every element cannot give these wrappers borders or spacing.
  const host = document.createElement('clearideas-widget-host')
  host.setAttribute('data-clearideas-widget-host', '')
  host.style.display = 'contents'
  container.appendChild(host)

  const css = getBundledCss()
  if (useShadowDom && typeof host.attachShadow === 'function') {
    const shadow = host.attachShadow({ mode: 'open' })
    applyStyles(shadow, [HOST_CSS, css])
    const mountPoint = document.createElement('div')
    shadow.appendChild(mountPoint)
    return { host, mountPoint }
  }

  // Without Shadow DOM the widget shares the page's styles (and the page can restyle it).
  applyStyles(document, [css])
  return { host, mountPoint: host }
}

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

/** A widget handle whose methods do nothing (consent pending) or warn (destroyed). */
function createInertInstance(message: string | null): WidgetInstance {
  const inert = () => {
    if (message) console.warn(`[ClearIdeasWidget] ${message}`)
  }
  const instance = { destroy: () => {} } as WidgetInstance
  for (const name of Object.keys(COMPONENT_METHODS) as MethodName[]) {
    ;(instance as any)[name] = name === 'sendMessage' ? async () => inert() : inert
  }
  return instance
}

/**
 * Initialize a Clear Ideas widget instance
 * @param config - Widget configuration
 * @returns Widget instance with control methods; destroy() removes only this widget
 * @throws {Error} If throwOnMissingConsent is true and consent is not granted
 */
export function init(config: WidgetConfig): WidgetInstance {
  // Check consent before initializing
  if (!checkConsent(config.hasConsent)) {
    if (config.throwOnMissingConsent) {
      throw new Error(
        'Widget initialization requires consent. Set hasConsent to true or ensure the consent check passes before calling init().',
      )
    }
    // Return a no-op instance if consent is not granted (unless throwOnMissingConsent is true)
    console.warn('[ClearIdeasWidget] init() returning no-op instance due to missing consent')
    return createInertInstance(
      'Widget is pending consent. Call init() again after consent is granted.',
    )
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

  // Options for init() itself are not component props (they would become HTML attributes).
  const containerOption = config.container
  const props: Record<string, unknown> = { ...config }
  for (const option of ['container', 'hasConsent', 'throwOnMissingConsent', 'shadowDom']) {
    delete props[option]
  }

  // Find the container, or create the default one
  let container: HTMLElement | null = null
  if (typeof containerOption === 'string') {
    const element = document.querySelector(containerOption)
    if (!element) {
      throw new Error(`Container element "${containerOption}" not found`)
    }
    container = element as HTMLElement
  } else if (containerOption instanceof HTMLElement) {
    container = containerOption
  }
  const key: HTMLElement | 'default' = container ?? 'default'

  // A widget already in this container is replaced.
  widgetsByContainer.get(key)?.destroy()

  let createdContainer: HTMLElement | null = null
  if (!container) {
    container = document.createElement('clearideas-widget')
    container.id = DEFAULT_CONTAINER_ID
    container.style.display = 'contents'
    document.body.appendChild(container)
    createdContainer = container
  }

  const { host, mountPoint } = createMountPoint(container, config.shadowDom !== false)
  const app = createApp(ClearIdeasWidgetStandalone, props as any)
  const component = app.mount(mountPoint) as unknown as Record<string, (...args: any[]) => any>
  let destroyed = false

  const instance = {} as WidgetInstance
  for (const [name, method] of Object.entries(COMPONENT_METHODS) as [MethodName, string][]) {
    ;(instance as any)[name] = (...args: unknown[]) => {
      if (destroyed) {
        console.warn(`[ClearIdeasWidget] ${name}() called on a destroyed widget`)
        return name === 'sendMessage' ? Promise.resolve() : undefined
      }
      return component[method]?.(...args)
    }
  }
  instance.destroy = () => {
    if (destroyed) return
    destroyed = true
    app.unmount() // the component releases its requests, listeners, timers and media
    host.remove()
    createdContainer?.remove()
    if (widgetsByContainer.get(key) === instance) widgetsByContainer.delete(key)
  }

  widgetsByContainer.set(key, instance)
  return instance
}

// Auto-initialize from data attributes
if (typeof document !== 'undefined') {
  autoInitializeFromDataAttributes(init)
}

// Expose global API
if (typeof window !== 'undefined') {
  // The IIFE bundle replaces this with the exports of index.ts, which include the same members.
  ;(window as any).ClearIdeasWidget = {
    init,
    /** Tags of the built-in languages, for example to build a language picker. */
    BUILT_IN_LOCALES,
  }
}
