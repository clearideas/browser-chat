// The page's light/dark theme, for widgets that follow it. Page state shared by all widgets,
// observed while at least one widget is mounted (like the page language in i18n/runtime.ts).

import { readonly, ref } from 'vue'

/** Attributes on <html> or <body> that theme switchers commonly set. */
const THEME_ATTRIBUTES = ['class', 'data-theme', 'data-bs-theme', 'data-color-scheme']
const DARK_QUERY = '(prefers-color-scheme: dark)'

export interface PageTheme {
  /** What the page's markup says: `dark`, `light`, or null when it says nothing. */
  marker: 'dark' | 'light' | null
  /** The system (browser) color scheme preference. */
  prefersDark: boolean
  /**
   * Counts observed theme attribute and preference changes, including ones this module cannot
   * interpret, so a site's own darkMode function is read again after any theme switch.
   */
  changes: number
}

function markerOf(element: Element | null): 'dark' | 'light' | null {
  if (!element) return null
  for (const name of THEME_ATTRIBUTES.slice(1)) {
    const value = element.getAttribute(name)?.trim().toLowerCase()
    if (value === 'dark' || value === 'light') return value
  }
  if (element.classList.contains('dark')) return 'dark'
  if (element.classList.contains('light')) return 'light'
  return null
}

function readPageTheme(): PageTheme {
  if (typeof document === 'undefined') return { marker: null, prefersDark: false, changes: 0 }
  const prefersDark =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? Boolean(window.matchMedia(DARK_QUERY)?.matches)
      : false
  return {
    marker: markerOf(document.documentElement) ?? markerOf(document.body),
    prefersDark,
    changes: 0,
  }
}

const pageTheme = ref<PageTheme>(readPageTheme())
let observer: MutationObserver | null = null
let media: MediaQueryList | null = null
let consumers = 0

function sync() {
  pageTheme.value = { ...readPageTheme(), changes: pageTheme.value.changes + 1 }
}

/** Starts following the page theme (called when a widget mounts). */
export function startPageThemeTracking(): void {
  if (typeof document === 'undefined') return
  consumers += 1
  if (!observer) {
    observer = new MutationObserver(sync)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: THEME_ATTRIBUTES,
    })
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: THEME_ATTRIBUTES })
    }
    if (typeof window.matchMedia === 'function') {
      media = window.matchMedia(DARK_QUERY)
      media?.addEventListener?.('change', sync)
    }
  }
  sync()
}

/** Stops following the page theme once no widget needs it. */
export function stopPageThemeTracking(): void {
  if (consumers > 0) consumers -= 1
  if (consumers === 0 && observer) {
    observer.disconnect()
    observer = null
    media?.removeEventListener?.('change', sync)
    media = null
  }
}

/** The page theme, updated while tracking. */
export const currentPageTheme = readonly(pageTheme)
