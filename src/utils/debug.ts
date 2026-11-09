/**
 * Debug logging utility
 * Enable debugging from console:
 *   window.__ClearIdeasWidgetDebug = true
 */

// Log immediately when this module loads to verify it's executing
if (typeof window !== 'undefined') {
  console.log('[ClearIdeasWidget] Debug utility loaded')
}

// Helper function to check debug state
function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return !!(window as any).__ClearIdeasWidgetDebug
}

export const debugLog = (...args: unknown[]): void => {
  if (isDebugEnabled()) {
    console.log(...args)
  }
}

export const debugWarn = (...args: unknown[]): void => {
  if (isDebugEnabled()) {
    console.warn(...args)
  }
}
