// Applies the widget's CSS to a shadow root (or, without Shadow DOM, to the document).
//
// The build (vite.config.ts) appends a line to every bundle that registers the compiled CSS under a
// global symbol keyed by package version. Nothing is written to the page when the bundle loads; the
// CSS is applied only where a widget is mounted.
//
// Constructable stylesheets (adoptedStyleSheets) are used where supported. Unlike <style> elements,
// they are not blocked by a Content-Security-Policy without 'unsafe-inline' for styles.

const REGISTRY_KEY = Symbol.for('clearideas.chat.css')

/** Styles for the shadow host: the page's inherited styles (fonts, colors, spacing) stop here. */
export const HOST_CSS = ':host{all:initial;display:contents}'

/** CSS compiled into this bundle, or '' when running from source (tests, the .vue component). */
export function getBundledCss(): string {
  const registry = (globalThis as Record<symbol, Record<string, string> | undefined>)[REGISTRY_KEY]
  const version = typeof __WIDGET_VERSION__ !== 'undefined' ? __WIDGET_VERSION__ : ''
  return registry?.[version] ?? ''
}

const sheetCache = new Map<string, CSSStyleSheet>()

function supportsAdoptedStyleSheets(target: Document | ShadowRoot): boolean {
  return (
    'adoptedStyleSheets' in target &&
    typeof CSSStyleSheet !== 'undefined' &&
    typeof CSSStyleSheet.prototype.replaceSync === 'function'
  )
}

/**
 * Adds each CSS text to `target` once. Identical texts share one stylesheet object across shadow
 * roots. Falls back to <style> elements where constructable stylesheets are unavailable.
 */
export function applyStyles(target: Document | ShadowRoot, cssTexts: string[]): void {
  const texts = cssTexts.filter(Boolean)
  if (texts.length === 0) return

  if (supportsAdoptedStyleSheets(target)) {
    const sheets = texts.map(text => {
      let sheet = sheetCache.get(text)
      if (!sheet) {
        sheet = new CSSStyleSheet()
        sheet.replaceSync(text)
        sheetCache.set(text, sheet)
      }
      return sheet
    })
    const current = target.adoptedStyleSheets
    const missing = sheets.filter(sheet => !current.includes(sheet))
    if (missing.length > 0) target.adoptedStyleSheets = [...current, ...missing]
    return
  }

  const parent = target instanceof Document ? target.head : target
  for (const text of texts) {
    const id = `clearideas-widget-style-${hash(text)}`
    const existing =
      target instanceof Document
        ? target.getElementById(id)
        : (target as ShadowRoot).querySelector(`#${id}`)
    if (existing) continue
    const style = document.createElement('style')
    style.id = id
    style.textContent = text
    parent.appendChild(style)
  }
}

function hash(text: string): string {
  let value = 0
  for (let index = 0; index < text.length; index += 1) {
    value = (Math.imul(31, value) + text.charCodeAt(index)) | 0
  }
  return (value >>> 0).toString(36)
}
