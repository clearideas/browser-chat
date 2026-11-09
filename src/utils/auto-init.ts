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

/**
 * Automatically initializes widgets from elements with data-clearideas-widget attribute
 * @param initFn - The init function to call for each widget
 */
export function autoInitializeFromDataAttributes(
  initFn: (config: WidgetConfig) => WidgetInstance,
): void {
  if (typeof document === 'undefined') {
    return
  }

  document.addEventListener('DOMContentLoaded', () => {
    const elements = document.querySelectorAll('[data-clearideas-widget]')
    elements.forEach(element => {
      const accessKey = element.getAttribute('data-access-key')
      // Use data attribute if provided, otherwise use default from build-time env
      const apiBaseUrl =
        element.getAttribute('data-api-base-url') ||
        (typeof __VITE_API_BASE_URL__ !== 'undefined' ? __VITE_API_BASE_URL__ : undefined)

      if (accessKey) {
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
        const consentRequired =
          consentRequiredAttr !== null ? consentRequiredAttr === 'true' : undefined
        const consentGrantedAttr = element.getAttribute('data-consent-granted')
        const consentGranted =
          consentGrantedAttr !== null ? consentGrantedAttr === 'true' : undefined
        const locale = element.getAttribute('data-locale') || undefined

        const config: WidgetConfig = {
          accessKey,
          ...(apiBaseUrl && { apiBaseUrl }),
          locale,
          container: element as HTMLElement,
          openOnLoad: element.getAttribute('data-open-on-load') === 'true',
          position: (element.getAttribute('data-position') ||
            'bottom-right') as WidgetConfig['position'],
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

        // Check consent before initializing
        if (!checkConsent(hasConsent)) {
          // Set up a polling mechanism to check consent periodically
          // Use 500ms interval to reduce resource usage (was 100ms)
          let checkInterval: ReturnType<typeof setInterval> | null = null
          let timeoutId: ReturnType<typeof setTimeout> | null = null

          const cleanup = () => {
            if (checkInterval) {
              clearInterval(checkInterval)
              checkInterval = null
            }
            if (timeoutId) {
              clearTimeout(timeoutId)
              timeoutId = null
            }
          }

          const consentEvent = `clearideas-consent-granted-${accessKey}`
          const handleConsent = () => {
            cleanup()
            document.removeEventListener(consentEvent, handleConsent)
            initFn(config)
          }

          // Check if element is still in DOM before polling
          const checkConsentAndInit = () => {
            // If element was removed from DOM, clean up and stop polling
            if (!element.parentNode || !document.contains(element)) {
              cleanup()
              document.removeEventListener(consentEvent, handleConsent)
              return
            }

            if (checkConsent(hasConsent)) {
              cleanup()
              document.removeEventListener(consentEvent, handleConsent)
              initFn(config)
            }
          }

          // Set up polling with 500ms interval (reduced from 100ms)
          checkInterval = setInterval(checkConsentAndInit, 500)

          // Also listen for a custom event (preferred method - less resource intensive)
          document.addEventListener(consentEvent, handleConsent)

          // Clean up interval after 5 minutes to avoid infinite polling
          timeoutId = setTimeout(() => {
            cleanup()
            document.removeEventListener(consentEvent, handleConsent)
          }, 300000)

          return
        }

        initFn(config)
      }
    })
  })
}
