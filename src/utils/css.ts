// Utility for injecting theme CSS into the document

const STYLE_ID = 'clearideas-widget-theme'

/**
 * Injects the theme CSS into the document head if not already present.
 * This function has side-effects (mutates document.head) but is idempotent.
 *
 * @param themeCSS - The CSS string to inject
 * @remarks
 * This function mutates the DOM by adding a <style> element to document.head.
 * It checks for an existing style element with the same ID to prevent duplicates.
 */
export function injectThemeCSS(themeCSS: string): void {
  if (typeof document === 'undefined') {
    return
  }

  let styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement
  if (!styleElement) {
    styleElement = document.createElement('style')
    styleElement.id = STYLE_ID
    styleElement.textContent = themeCSS
    document.head.appendChild(styleElement)
  }
}
