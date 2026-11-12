// Auto-initialization from HTML data attributes

import type { WidgetConfig, WidgetInstance } from '../types'

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

/** Reads a widget configuration from an element's data attributes (null without an access key). */
export function configFromElement(element: Element): WidgetConfig | null {
  const accessKey = element.getAttribute('data-access-key')
  // Use data attribute if provided, otherwise use default from build-time env
  const apiBaseUrl =
    element.getAttribute('data-api-base-url') ||
    (typeof __VITE_API_BASE_URL__ !== 'undefined' ? __VITE_API_BASE_URL__ : undefined)

  if (!accessKey) return null
  // Check for hasConsent data attribute
  const hasConsentAttr = element.getAttribute('data-has-consent')
  let hasConsent: WidgetConfig['hasConsent'] = undefined
  if (hasConsentAttr) {
    if (hasConsentAttr === 'true') {
      hasConsent = true
    } else if (hasConsentAttr === 'false') {
      hasConsent = false
    } else {
      // Assume it's a global variable/function name
      hasConsent = hasConsentAttr
    }
  }

  // Check for darkMode data attribute (allows parent page to communicate dark mode state)
  const darkModeAttr = element.getAttribute('data-dark-mode')
  let darkMode: boolean | undefined = undefined
  if (darkModeAttr === 'true') {
    darkMode = true
  } else if (darkModeAttr === 'false') {
    darkMode = false
  }

  // Check for absolute positioning attributes
  const topAttr = element.getAttribute('data-top')
  const rightAttr = element.getAttribute('data-right')
  const bottomAttr = element.getAttribute('data-bottom')
  const leftAttr = element.getAttribute('data-left')
  const top = topAttr ? parseInt(topAttr) : undefined
  const right = rightAttr ? parseInt(rightAttr) : undefined
  const bottom = bottomAttr ? parseInt(bottomAttr) : undefined
  const left = leftAttr ? parseInt(leftAttr) : undefined

  // Check for FAB size attribute
  const fabSizeAttr = element.getAttribute('data-fab-size')
  const fabSize = fabSizeAttr ? parseInt(fabSizeAttr) : undefined

  // Check for FAB hide attribute
  const fabHideAttr = element.getAttribute('data-fab-hide')
  const fabHide = fabHideAttr === 'true'

  // Check for GDPR consent attributes
  const consentRequiredAttr = element.getAttribute('data-consent-required')
  const consentRequired = consentRequiredAttr !== null ? consentRequiredAttr === 'true' : undefined
  const consentGrantedAttr = element.getAttribute('data-consent-granted')
  const consentGranted = consentGrantedAttr !== null ? consentGrantedAttr === 'true' : undefined
  const locale = element.getAttribute('data-locale') || undefined
  const userId = element.getAttribute('data-user-id') || undefined
  const userName = element.getAttribute('data-user-name') || undefined
  const userEmail = element.getAttribute('data-user-email') || undefined
  const shadowDom = element.getAttribute('data-shadow-dom') !== 'false'

  const config: WidgetConfig = {
    accessKey,
    ...(apiBaseUrl && { apiBaseUrl }),
    locale,
    ...(userId && { userId }),
    ...(userName && { userName }),
    ...(userEmail && { userEmail }),
    shadowDom,
    container: element as HTMLElement,
    openOnLoad: element.getAttribute('data-open-on-load') === 'true',
    position: (element.getAttribute('data-position') || 'bottom-right') as WidgetConfig['position'],
    width: element.getAttribute('data-width')
      ? parseInt(element.getAttribute('data-width')!)
      : undefined,
    height: element.getAttribute('data-height')
      ? parseInt(element.getAttribute('data-height')!)
      : undefined,
    ...(top !== undefined && { top }),
    ...(right !== undefined && { right }),
    ...(bottom !== undefined && { bottom }),
    ...(left !== undefined && { left }),
    ...(hasConsent !== undefined && { hasConsent }),
    ...(darkMode !== undefined && { darkMode }),
    ...(fabSize !== undefined && { fabSize }),
    ...(fabHide && { fabHide }),
    ...(consentRequired !== undefined && { consentRequired }),
    ...(consentGranted !== undefined && { consentGranted }),
  }
  return config
}

interface ElementWidget {
  instance?: WidgetInstance
  /** Stops waiting for consent. */
  cancel?: () => void
}

let stopActive: (() => void) | null = null

/**
 * Initializes a widget for every element with data-clearideas-widget: those present when the page
 * is ready, and those added later (for example by a single-page app). When such an element is
 * removed from the page, its widget is destroyed. Calling this again replaces the previous
 * auto-initializer. Returns a function that stops watching the page.
 */
export function autoInitializeFromDataAttributes(
  initFn: (config: WidgetConfig) => WidgetInstance,
): () => void {
  if (typeof document === 'undefined') {
    return () => {}
  }
  stopActive?.()

  const widgets = new Map<Element, ElementWidget>()
  let observer: MutationObserver | null = null
  let started = false
  let stopped = false

  const start = (element: Element, config: WidgetConfig) => {
    widgets.set(element, { instance: initFn(config) })
  }

  const initializeElement = (element: Element) => {
    if (widgets.has(element)) return
    const config = configFromElement(element)
    if (!config) return
    const hasConsent = config.hasConsent

    if (checkConsent(hasConsent)) {
      start(element, config)
      return
    }

    // Wait for consent: a custom event (preferred), or polling every 500 ms for up to 5 minutes.
    const consentEvent = `clearideas-consent-granted-${config.accessKey}`
    const cancel = () => {
      clearInterval(checkInterval)
      clearTimeout(timeoutId)
      document.removeEventListener(consentEvent, handleConsent)
    }
    const handleConsent = () => {
      cancel()
      start(element, config)
    }
    const checkInterval = setInterval(() => {
      if (!element.isConnected) {
        cancel()
        widgets.delete(element)
      } else if (checkConsent(hasConsent)) {
        handleConsent()
      }
    }, 500)
    const timeoutId = setTimeout(cancel, 300000)
    document.addEventListener(consentEvent, handleConsent)
    widgets.set(element, { cancel })
  }

  const releaseElement = (element: Element) => {
    const widget = widgets.get(element)
    if (!widget) return
    widgets.delete(element)
    widget.cancel?.()
    widget.instance?.destroy()
  }

  const initializeAll = () => {
    if (started || stopped) return // a queued run may fire after stop()
    started = true
    document.querySelectorAll('[data-clearideas-widget]').forEach(initializeElement)

    if (typeof MutationObserver === 'undefined') return
    observer = new MutationObserver(records => {
      for (const record of records) {
        record.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return
          if (node.matches('[data-clearideas-widget]')) initializeElement(node)
          node.querySelectorAll('[data-clearideas-widget]').forEach(initializeElement)
        })
      }
      // Widgets whose element left the page (removed directly or with an ancestor).
      if (records.some(record => record.removedNodes.length > 0)) {
        for (const element of [...widgets.keys()]) {
          if (!element.isConnected) releaseElement(element)
        }
      }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
  }

  const stop = () => {
    stopped = true
    document.removeEventListener('DOMContentLoaded', initializeAll)
    observer?.disconnect()
    observer = null
    for (const widget of widgets.values()) widget.cancel?.()
    if (stopActive === stop) stopActive = null
  }
  stopActive = stop

  // Scripts loaded with async, or injected after the page loaded, miss DOMContentLoaded. Run after
  // the current script finishes either way (a microtask), so the bundled CSS is registered first.
  document.addEventListener('DOMContentLoaded', initializeAll)
  if (document.readyState !== 'loading') queueMicrotask(initializeAll)

  return stop
}
