import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentPageTheme, startPageThemeTracking, stopPageThemeTracking } from '@/utils/page-theme'

const root = document.documentElement
const flush = () => new Promise(resolve => setTimeout(resolve, 0)) // MutationObserver callbacks

/** A matchMedia stand-in whose answer can be changed, firing "change" like a browser. */
function mockColorScheme(initiallyDark: boolean) {
  const listeners = new Set<() => void>()
  let dark = initiallyDark
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return dark
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia
  return (next: boolean) => {
    dark = next
    listeners.forEach(listener => listener())
  }
}

afterEach(() => {
  stopPageThemeTracking()
  root.className = ''
  for (const name of ['data-theme', 'data-bs-theme', 'data-color-scheme']) {
    root.removeAttribute(name)
    document.body.removeAttribute(name)
  }
  document.body.className = ''
})

describe('page theme', () => {
  it.each([
    ['class', 'dark', 'dark'],
    ['class', 'light', 'light'],
    ['class', 'other', null],
    ['data-theme', 'dark', 'dark'],
    ['data-theme', 'Light', 'light'],
    ['data-bs-theme', 'dark', 'dark'],
    ['data-color-scheme', 'dark', 'dark'],
  ])('reads %s="%s" on <html> as %s', async (name, value, marker) => {
    mockColorScheme(false)
    startPageThemeTracking()
    root.setAttribute(name, value)
    await flush()
    expect(currentPageTheme.value.marker).toBe(marker)
  })

  it('reads <body> when <html> says nothing, and prefers <html>', async () => {
    mockColorScheme(false)
    startPageThemeTracking()
    document.body.classList.add('dark')
    await flush()
    expect(currentPageTheme.value.marker).toBe('dark')
    root.setAttribute('data-theme', 'light')
    await flush()
    expect(currentPageTheme.value.marker).toBe('light')
  })

  it('follows system preference changes', () => {
    const setDark = mockColorScheme(false)
    startPageThemeTracking()
    expect(currentPageTheme.value.prefersDark).toBe(false)
    setDark(true)
    expect(currentPageTheme.value.prefersDark).toBe(true)
  })

  it('stops observing when the last widget stops', async () => {
    mockColorScheme(false)
    startPageThemeTracking()
    startPageThemeTracking()
    stopPageThemeTracking()
    root.classList.add('dark')
    await flush()
    expect(currentPageTheme.value.marker).toBe('dark') // one widget still tracking
    stopPageThemeTracking()
    root.classList.remove('dark')
    await flush()
    expect(currentPageTheme.value.marker).toBe('dark') // no longer observed
  })
})
