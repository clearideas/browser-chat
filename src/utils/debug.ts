/**
 * Debug logging, off by default. Enable it from the browser console:
 *   window.__ClearIdeasWidgetDebug = true
 * Warnings and errors are always logged with console.warn/console.error.
 */

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).__ClearIdeasWidgetDebug
}

export const debugLog = (...args: unknown[]): void => {
  if (isDebugEnabled()) console.info(...args)
}

export const debugWarn = (...args: unknown[]): void => {
  if (isDebugEnabled()) console.warn(...args)
}
